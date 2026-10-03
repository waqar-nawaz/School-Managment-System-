import { Router, Request } from "express";
import { Op, UniqueConstraintError, Transaction, WhereOptions } from "sequelize";
import { authenticate } from "../../middlewares/authenticate";
import { authorize } from "../../middlewares/authorize";
import asyncHandler from "../../utils/asyncHandler";
import { ApiResponse } from "../../utils/ApiResponse";
import { ApiError } from "../../utils/ApiError";
import { createCrudController } from "../../utils/crudFactory";
import { exportCsv } from "../../utils/csvExport";
import { studentScope } from "../../utils/access";
import { writeAuditLog } from "../../services/audit.service";
import { sequelize } from "../../database/sequelize";
import { HostelAllocation, Student, FeeType, Bed } from "../../models";
import { plain } from "../resources/definitions/shared";
import {
  syncBed, loadBedChain, assertBedAssignable, assertStudentFitsHostel,
} from "./hostel.service";

const router = Router();
router.use(authenticate);

const dayOf = (d: Date | string): string => new Date(d).toISOString().slice(0, 10);

function parseDate(value: unknown, label: string): Date {
  const d = new Date(String(value));
  if (!Number.isFinite(d.getTime())) throw ApiError.badRequest(`${label} is not a valid date`);
  return d;
}

/** Moving out / transferring happens now (the bed is released immediately), so a future date makes no sense. */
function assertNotFuture(d: Date, label: string): void {
  if (d.getTime() > Date.now() + 24 * 3600 * 1000) throw ApiError.badRequest(`${label} cannot be in the future`);
}

function parseFee(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw ApiError.badRequest("Monthly fee must be a number, zero or more");
  return n;
}

const base = createCrudController<HostelAllocation>({
  model: HostelAllocation,
  searchable: [],
  defaultSort: [["createdAt", "DESC"]],
  // Parents see their children's allocations, students their own; staff see the whole branch.
  scopeWhere: (req: Request) => studentScope(req, "studentId"),
  // Search by student name / admission number (the allocation row itself has no name columns).
  toSearchWhere: (q: string) => {
    const like = sequelize.escape(`%${q}%`);
    return {
      studentId: {
        [Op.in]: sequelize.literal(
          `(SELECT id FROM students WHERE "firstName" ILIKE ${like} OR "lastName" ILIKE ${like} OR "admissionNo" ILIKE ${like})`
        ),
      },
    } as WhereOptions;
  },
  includes: [
    { association: "student", attributes: ["id", "firstName", "lastName", "admissionNo", "gender"] },
    { association: "hostel", attributes: ["id", "name"] },
    { association: "room", attributes: ["id", "roomNo"] },
    { association: "bed", attributes: ["id", "bedNo"] },
  ],
  decorate: (row: any) => {
    const p = plain(row);
    p.studentName = p.student ? `${p.student.firstName} ${p.student.lastName}`.trim() : "";
    p.admissionNo = p.student?.admissionNo ?? "";
    p.hostelName = p.hostel?.name ?? "";
    p.roomNo = p.room?.roomNo ?? "";
    p.bedNo = p.bed?.bedNo ?? "";
    return p;
  },
} as any);

/** Allocation the caller may act on (branch + parent/student scope), or 404. */
async function findScoped(req: Request, id: number, t?: Transaction): Promise<HostelAllocation> {
  if (!Number.isInteger(id) || id <= 0) throw ApiError.badRequest("Invalid id");
  const and: WhereOptions[] = [{ id } as any, await studentScope(req, "studentId")];
  if (req.user?.branchId != null) and.push({ branchId: req.user.branchId } as any);
  const row = await HostelAllocation.findOne({ where: { [Op.and]: and }, transaction: t, ...(t ? { lock: t.LOCK.UPDATE } : {}) });
  if (!row) throw ApiError.notFound("Hostel allocation not found");
  return row;
}

/** Turn the DB's "one active allocation" index violation into a friendly message. */
async function guard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof UniqueConstraintError) {
      throw ApiError.conflict("Someone else just allocated this bed (or this student). Please refresh and try again.");
    }
    throw err;
  }
}

const audit = (req: Request, entityId: number, newData: Record<string, unknown>) =>
  writeAuditLog({
    action: "update", entity: "hostel_allocation", entityId, userId: req.user?.id, role: req.user?.role,
    branchId: req.user?.branchId ?? null, ip: req.ip, newData,
  } as any);

// ------------------------------------------------------------------ read
router.get("/", authorize("hostel-allocations:read"), (req, res, next) => base.list(req, res).catch(next));
router.get("/count", authorize("hostel-allocations:read"), (req, res, next) => base.count(req, res).catch(next));
router.get("/export", authorize("reports:export"), authorize("hostel-allocations:read"), exportCsv(HostelAllocation, "hostel-allocations", base));
// ------------------------------------------------ options for the allocate/transfer dialogs
// Every FREE, usable bed in the branch (no 100-row paging limit) + students who already hold a bed.
router.get("/options", authorize("hostel-allocations:create", "hostel-allocations:update"), asyncHandler(async (req, res) => {
  const branchId = req.user?.branchId ?? null;
  const branch = branchId != null ? { branchId } : {};
  const beds = await Bed.findAll({
    where: { status: "available", ...branch },
    attributes: ["id", "bedNo", "roomId"],
    include: [{
      association: "room", attributes: ["id", "roomNo", "hostelId"], required: true, where: { status: { [Op.ne]: "maintenance" } },
      include: [{ association: "hostel", attributes: ["id", "name", "gender"], required: true, where: { isActive: true } }],
    }],
    limit: 5000,
  });
  const active = await HostelAllocation.findAll({ where: { status: "active", ...branch }, attributes: ["studentId"] });
  const freeBeds = beds.map((b: any) => ({
    id: Number(b.id), bedNo: b.bedNo, roomId: Number(b.roomId), roomNo: b.room.roomNo,
    hostelId: Number(b.room.hostelId), hostelName: b.room.hostel.name, hostelGender: b.room.hostel.gender,
  })).sort((a, b) => a.hostelName.localeCompare(b.hostelName) || a.roomNo.localeCompare(b.roomNo, undefined, { numeric: true }) || a.bedNo.localeCompare(b.bedNo, undefined, { numeric: true }));
  ApiResponse.success(res, 200, "Hostel options", { beds: freeBeds, activeStudentIds: active.map((a) => Number(a.studentId)) });
}));

router.get("/:id", authorize("hostel-allocations:read"), (req, res, next) => base.getOne(req, res).catch(next));

// ---------------------------------------------------------------- allocate
router.post("/", authorize("hostel-allocations:create"), asyncHandler(async (req, res) => {
  const studentId = Number(req.body.studentId);
  const bedId = Number(req.body.bedId);
  if (!Number.isInteger(studentId) || studentId <= 0) throw ApiError.badRequest("Please choose a student");
  if (!Number.isInteger(bedId) || bedId <= 0) throw ApiError.badRequest("Please choose a bed");
  const checkIn = req.body.checkIn ? parseDate(req.body.checkIn, "Check-in date") : new Date();
  const branchId = req.user?.branchId ?? null;

  const created = await guard(() => sequelize.transaction(async (t) => {
    const student = await Student.findByPk(studentId, { transaction: t, lock: t.LOCK.UPDATE });
    if (!student || (branchId != null && Number(student.branchId) !== Number(branchId))) throw ApiError.badRequest("Student was not found in your branch");
    if (student.isActive === false) throw ApiError.badRequest("This student is inactive");

    const chain = await loadBedChain(bedId, branchId, t);
    // The UI may send hostelId/roomId too; they must agree with the bed (compare as numbers: ids arrive as strings from Postgres).
    if (req.body.roomId && Number(req.body.roomId) !== Number(chain.room.id)) throw ApiError.badRequest("The selected room does not contain this bed");
    if (req.body.hostelId && Number(req.body.hostelId) !== Number(chain.hostel.id)) throw ApiError.badRequest("The selected hostel does not contain this room");
    assertStudentFitsHostel(student, chain.hostel);
    assertBedAssignable(chain);

    const current = await HostelAllocation.findOne({ where: { studentId, status: "active" }, transaction: t });
    if (current) throw ApiError.badRequest(`${student.firstName} ${student.lastName} already has an active hostel bed. Check them out or transfer them first.`);

    let monthlyFee = req.body.monthlyFee;
    if (monthlyFee === undefined || monthlyFee === null || monthlyFee === "") {
      // Default to the school's hostel fee type, when one is configured.
      const fee = await FeeType.findOne({ where: { category: "hostel", isActive: true, branchId: student.branchId }, order: [["id", "ASC"]], transaction: t });
      monthlyFee = fee ? Number(fee.amount) : 0;
    }

    const row = await HostelAllocation.create({
      studentId, hostelId: chain.hostel.id, roomId: chain.room.id, bedId: chain.bed.id, branchId: student.branchId,
      checkIn, checkOut: null, monthlyFee: parseFee(monthlyFee), status: "active",
    } as any, { transaction: t });
    await syncBed(Number(chain.bed.id), t);
    return row;
  }));

  await audit(req, Number(created.id), { event: "allocated", studentId, bedId });
  const fresh = await HostelAllocation.findByPk(created.id, { include: ["student", "hostel", "room", "bed"] });
  ApiResponse.success(res, 201, "Bed allocated", fresh ?? created);
}));

// ---------------------------------------------------------------- check out
router.post("/:id/checkout", authorize("hostel-allocations:update"), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const updated = await guard(() => sequelize.transaction(async (t) => {
    const row = await findScoped(req, id, t);
    if (row.status !== "active") throw ApiError.badRequest("This allocation is already closed");
    const checkOut = req.body?.checkOut ? parseDate(req.body.checkOut, "Check-out date") : new Date();
    assertNotFuture(checkOut, "Check-out date");
    if (dayOf(checkOut) < dayOf(row.checkIn)) throw ApiError.badRequest("Check-out cannot be before the check-in date");
    await row.update({ status: "checked_out", checkOut }, { transaction: t });
    await syncBed(Number(row.bedId), t);
    return row;
  }));
  await audit(req, id, { event: "checked_out" });
  ApiResponse.success(res, 200, "Student checked out and bed released", updated);
}));

// ---------------------------------------------------------------- transfer
router.post("/:id/transfer", authorize("hostel-allocations:update"), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const newBedId = Number(req.body?.bedId);
  if (!Number.isInteger(newBedId) || newBedId <= 0) throw ApiError.badRequest("Please choose the new bed");
  const branchId = req.user?.branchId ?? null;

  const created = await guard(() => sequelize.transaction(async (t) => {
    const old = await findScoped(req, id, t);
    if (old.status !== "active") throw ApiError.badRequest("Only an active allocation can be transferred");
    if (Number(old.bedId) === newBedId) throw ApiError.badRequest("The student is already in this bed");

    const student = await Student.findByPk(old.studentId, { transaction: t, lock: t.LOCK.UPDATE });
    if (!student) throw ApiError.notFound("Student not found");
    const chain = await loadBedChain(newBedId, branchId ?? old.branchId, t);
    assertStudentFitsHostel(student, chain.hostel);
    assertBedAssignable(chain);

    const when = req.body?.transferDate ? parseDate(req.body.transferDate, "Transfer date") : new Date();
    assertNotFuture(when, "Transfer date");
    if (dayOf(when) < dayOf(old.checkIn)) throw ApiError.badRequest("Transfer date cannot be before the check-in date");

    // Keep history: the old row is closed as "transferred", a fresh active row is opened.
    await old.update({ status: "transferred", checkOut: when }, { transaction: t });
    const fee = req.body?.monthlyFee === undefined || req.body.monthlyFee === "" ? Number(old.monthlyFee) : parseFee(req.body.monthlyFee);
    const row = await HostelAllocation.create({
      studentId: old.studentId, hostelId: chain.hostel.id, roomId: chain.room.id, bedId: chain.bed.id,
      branchId: old.branchId, checkIn: when, checkOut: null, monthlyFee: fee, status: "active",
    } as any, { transaction: t });
    await syncBed(Number(old.bedId), t);
    await syncBed(Number(chain.bed.id), t);
    return row;
  }));
  await audit(req, id, { event: "transferred", toBedId: newBedId, newAllocationId: created.id });
  ApiResponse.success(res, 200, "Student transferred", created);
}));

// ---------------------------------------------------------------- edit (fee / dates only)
router.put("/:id", authorize("hostel-allocations:update"), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const b = req.body ?? {};
  const row = await sequelize.transaction(async (t) => {
    const r = await findScoped(req, id, t);
    // Who/where/status are changed through dedicated actions so beds can never get out of sync.
    if (b.studentId !== undefined && Number(b.studentId) !== Number(r.studentId)) throw ApiError.badRequest("The student cannot be changed. Check this student out and allocate a new one.");
    if (b.bedId !== undefined && Number(b.bedId) !== Number(r.bedId)) throw ApiError.badRequest("To move the student to another bed use Transfer.");
    if (b.status !== undefined && b.status !== r.status) throw ApiError.badRequest("Use Check out or Transfer to change the status.");

    const patch: Record<string, unknown> = {};
    if (b.monthlyFee !== undefined && b.monthlyFee !== "") patch.monthlyFee = parseFee(b.monthlyFee);
    const checkIn = b.checkIn ? parseDate(b.checkIn, "Check-in date") : new Date(r.checkIn);
    if (b.checkIn) patch.checkIn = checkIn;
    if (b.checkOut !== undefined) {
      if (b.checkOut && r.status === "active") throw ApiError.badRequest("This student is still living here. Use Check out to close the allocation.");
      if (b.checkOut) {
        const out = parseDate(b.checkOut, "Check-out date");
        if (dayOf(out) < dayOf(checkIn)) throw ApiError.badRequest("Check-out cannot be before the check-in date");
        patch.checkOut = out;
      } else if (r.status !== "active") {
        throw ApiError.badRequest("A closed allocation needs a check-out date");
      }
    }
    if (r.checkOut && b.checkIn && dayOf(r.checkOut) < dayOf(checkIn)) throw ApiError.badRequest("Check-in cannot be after the check-out date");
    await r.update(patch, { transaction: t });
    return r;
  });
  await audit(req, id, { event: "edited" });
  ApiResponse.success(res, 200, "Allocation updated", row);
}));

// ---------------------------------------------------------------- delete
router.delete("/:id", authorize("hostel-allocations:delete"), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  await sequelize.transaction(async (t) => {
    const row = await findScoped(req, id, t);
    const wasActive = row.status === "active";
    const bedId = Number(row.bedId);
    await row.destroy({ transaction: t });
    // Only an ACTIVE row holds the bed. Removing old history must never free someone else's bed.
    if (wasActive) await syncBed(bedId, t);
  });
  await writeAuditLog({
    action: "delete", entity: "hostel_allocation", entityId: id, userId: req.user?.id, role: req.user?.role,
    branchId: req.user?.branchId ?? null, ip: req.ip,
  } as any);
  ApiResponse.success(res, 200, "Allocation deleted", null);
}));

export default router;
