import { Router } from "express";
import { Op } from "sequelize";
import { sequelize } from "../../database/sequelize";
import { authenticate } from "../../middlewares/authenticate";
import { authorize } from "../../middlewares/authorize";
import asyncHandler from "../../utils/asyncHandler";
import { ApiResponse } from "../../utils/ApiResponse";
import { ApiError } from "../../utils/ApiError";
import {
  Student, Parent, StudentGuardian, Enrolment, User, Attendance, Invoice, SchoolClass, Section,
  HostelAllocation, AdmissionApplication,
} from "../../models";
import { createCrudController } from "../../utils/crudFactory";
import { exportCsv } from "../../utils/csvExport";
import { assertStudentAccess, ownStudentIds, canSeeMedical } from "../../utils/access";
import { writeAuditLog } from "../../services/audit.service";
import { getPermissionsForRole } from "../../services/rbac.service";
import { generateRandomPassword } from "../../utils/password.util";
import { adminResetPassword } from "../users/users.service";
import { monthRange } from "../../utils/dateRange";
import {
  admitStudent, deactivateStudent, reactivateStudent, assertSectionHasRoom, cleanGender, cleanDob, cleanPhone, cleanEmail,
  resolveAcademicYear, pickRollNo,
} from "./students.service";

const router = Router();
router.use(authenticate);

const base = createCrudController<Student>({
  model: Student,
  searchable: ["firstName", "lastName", "admissionNo", "email", "guardianName", "guardianPhone"],
  defaultSort: [["admissionNo", "ASC"]],
  includes: [{ association: "enrolments" }],
  defaultWhere: { isActive: true },
  // Medical details only for admins/family (teachers etc. use health-records with its own permission).
  hideAttributes: (req: any) => (canSeeMedical(req.user?.role) ? [] : ["medicalInfo"]),
});

function stripMedical(req: any, student: any) {
  const json = typeof student.toJSON === "function" ? student.toJSON() : { ...student };
  if (!canSeeMedical(req.user?.role)) delete json.medicalInfo;
  return json;
}

router.get("/", authorize("students:read"), asyncHandler(async (req, res) => {
  // Parents see their children, students see themselves; staff see the branch (paginated).
  if (req.user?.role === "parent" || req.user?.role === "student") {
    const ids = (await ownStudentIds(req)) ?? [];
    const rows = ids.length ? await Student.findAll({ where: { id: ids }, include: [{ association: "enrolments" }] }) : [];
    return ApiResponse.success(res, 200, "List fetched", rows);
  }
  return base.list(req, res);
}));

// Same filters/scope/hidden columns as the list screen; needs the export right AND student access.
router.get("/export", authorize("reports:export"), authorize("students:read"), exportCsv(Student, "students", base));

router.get("/inactive", authorize("students:update"), asyncHandler(async (req, res) => {
  // For super_admin (branchId=null), don't filter by branchId — show all branches.
  const branchFilter = req.user?.branchId != null ? { branchId: req.user.branchId } : {};
  const rows = await Student.findAll({
    where: { ...branchFilter, isActive: false },
    include: [{ association: "enrolments" }],
    order: [["admissionNo", "ASC"]],
  });
  ApiResponse.success(res, 200, "Inactive students", rows);
}));

router.get("/:id", authorize("students:read"), asyncHandler(async (req, res) => {
  const student = await assertStudentAccess(req, Number(req.params.id));
  ApiResponse.success(res, 200, "Fetched", stripMedical(req, student));
}));

router.post(
  "/",
  authorize("students:create"),
  asyncHandler(async (req, res) => {
    const branchId = Number(req.user?.branchId);
    if (!Number.isInteger(branchId) || branchId <= 0) throw ApiError.badRequest("User is not assigned to a branch");
    const body = req.body ?? {};
    const { student, credentials } = await sequelize.transaction((t) =>
      admitStudent(
        { ...body, dateOfBirth: body.dateOfBirth ?? body.dob, currentClassId: body.currentClassId ?? body.classId, currentSectionId: body.currentSectionId ?? body.sectionId },
        { branchId, userId: req.user!.id },
        t
      )
    );
    await writeAuditLog({
      action: "create", entity: "student", entityId: student.id, userId: req.user!.id,
      role: req.user!.role, ip: req.ip, newData: { admissionNo: student.admissionNo },
    });
    // Login details are returned ONCE so staff can give them to the family (only hashes are stored).
    ApiResponse.success(res, 201, "Student admitted", { ...(student.toJSON() as object), credentials });
  })
);

const blank = (v: unknown) => v === "" || v === undefined;

router.put("/:id", authorize("students:update"), asyncHandler(async (req, res) => {
  const student = await assertStudentAccess(req, Number(req.params.id));
  const b = req.body as Record<string, any>;
  const branchId = Number(req.user?.branchId ?? student.branchId);
  const patch: Record<string, unknown> = {};

  const plain = ["bloodGroup", "religion", "nationality", "address", "guardianName"] as const;
  for (const k of plain) if (b[k] !== undefined) patch[k] = blank(b[k]) ? null : String(b[k]).trim();
  if (b.firstName !== undefined) {
    const v = String(b.firstName).trim();
    if (!v) throw ApiError.badRequest("First name cannot be empty");
    if (v.length > 120) throw ApiError.badRequest("Student name is too long");
    patch.firstName = v;
  }
  if (b.lastName !== undefined) patch.lastName = String(b.lastName ?? "").trim();
  if (b.gender !== undefined) patch.gender = cleanGender(b.gender, true);
  if (b.dateOfBirth !== undefined || b.dob !== undefined) patch.dateOfBirth = cleanDob(b.dateOfBirth ?? b.dob);
  if (b.email !== undefined) patch.email = cleanEmail(b.email);
  if (b.guardianPhone !== undefined) patch.guardianPhone = cleanPhone(b.guardianPhone, "Guardian phone");
  if (b.emergencyContact !== undefined) patch.emergencyContact = cleanPhone(b.emergencyContact, "Emergency contact");
  if (b.admissionDate !== undefined && b.admissionDate !== "") {
    const d = new Date(String(b.admissionDate));
    if (!Number.isFinite(d.getTime())) throw ApiError.badRequest("Admission date is not a valid date");
    patch.admissionDate = d;
  }
  if (b.medicalInfo !== undefined) {
    if (b.medicalInfo !== null && (typeof b.medicalInfo !== "object" || Array.isArray(b.medicalInfo))) throw ApiError.badRequest("Medical info must be an object");
    patch.medicalInfo = b.medicalInfo;
  }

  // A boys/girls hostel resident cannot be switched to the other gender behind the hostel's back.
  if (patch.gender && patch.gender !== student.gender) {
    const stay: any = await HostelAllocation.findOne({ where: { studentId: student.id, status: "active" }, include: ["hostel"] });
    const hg = stay?.hostel?.gender;
    if (stay && ((hg === "boys" && patch.gender !== "male") || (hg === "girls" && patch.gender !== "female"))) {
      throw ApiError.badRequest(`${student.firstName} lives in "${stay.hostel.name}" (${hg} only). Check them out of the hostel first.`);
    }
  }

  // ---- class / section (empty string means "none"; changing class without a section clears the old one)
  const classGiven = b.currentClassId !== undefined || b.classId !== undefined;
  const sectionGiven = b.currentSectionId !== undefined || b.sectionId !== undefined;
  const rawClass = b.currentClassId !== undefined ? b.currentClassId : b.classId;
  const rawSection = b.currentSectionId !== undefined ? b.currentSectionId : b.sectionId;
  const oldClassId = student.currentClassId != null ? Number(student.currentClassId) : null;
  const newClassId = classGiven ? (blank(rawClass) || rawClass === null ? null : Number(rawClass)) : oldClassId;
  let newSectionId: number | null = sectionGiven ? (blank(rawSection) || rawSection === null ? null : Number(rawSection)) : (student.currentSectionId != null ? Number(student.currentSectionId) : null);
  if (classGiven && newClassId !== oldClassId && !sectionGiven) newSectionId = null;
  if (newClassId !== null && (!Number.isInteger(newClassId) || newClassId <= 0)) throw ApiError.badRequest("Invalid class");
  if (newSectionId !== null && (!Number.isInteger(newSectionId) || newSectionId <= 0)) throw ApiError.badRequest("Invalid section");
  if (newSectionId && !newClassId) throw ApiError.badRequest("Choose the class before the section");

  const placementChanged = classGiven || sectionGiven;
  if (placementChanged) {
    patch.currentClassId = newClassId;
    patch.currentSectionId = newSectionId;
    if (newClassId) {
      const klass = await SchoolClass.findOne({ where: { id: newClassId, branchId } });
      if (!klass || !klass.isActive) throw ApiError.badRequest("Class not found, inactive or outside your branch");
    }
  }

  const wasActive = student.isActive === true;
  const wantsActive = b.isActive === undefined ? undefined : b.isActive === true || b.isActive === "true";
  const rollGiven = b.rollNo !== undefined;

  await sequelize.transaction(async (transaction) => {
    if (placementChanged && newClassId && newSectionId && (wantsActive ?? wasActive)) {
      await assertSectionHasRoom(branchId, Number(student.id), newSectionId, newClassId, transaction);
    }
    await student.update(patch, { transaction });

    if (wantsActive === false && wasActive) {
      await deactivateStudent(student, transaction);
    } else if (wantsActive === true && !wasActive) {
      await reactivateStudent(branchId, student, transaction);
    } else if ((placementChanged || rollGiven) && (wantsActive ?? wasActive)) {
      const year = await resolveAcademicYear(undefined, branchId, undefined, transaction);
      const existing = await Enrolment.findOne({ where: { studentId: student.id, academicYearId: year.id }, transaction });
      if (newClassId) {
        const moved = !existing || Number(existing.classId) !== newClassId || (existing.sectionId != null ? Number(existing.sectionId) : null) !== newSectionId;
        const rollNo = rollGiven || moved
          ? await pickRollNo(rollGiven ? b.rollNo : null, { yearId: Number(year.id), classId: newClassId, sectionId: newSectionId }, Number(student.id), transaction)
          : existing!.rollNo;
        if (existing) await existing.update({ classId: newClassId, sectionId: newSectionId, rollNo, status: "active", branchId }, { transaction });
        else await Enrolment.create({ studentId: student.id, academicYearId: year.id, classId: newClassId, sectionId: newSectionId, rollNo, branchId, enrolledOn: new Date(), status: "active" } as any, { transaction });
      } else if (existing && placementChanged) {
        // Class was cleared: the student is no longer placed anywhere this year.
        await existing.update({ status: "withdrawn" }, { transaction });
      }
    }

    // Keep the login account's name/gender/phone in step with the student record.
    if (student.userId && (patch.firstName !== undefined || patch.lastName !== undefined || patch.gender !== undefined || patch.guardianPhone !== undefined)) {
      await User.update(
        {
          ...(patch.firstName !== undefined ? { firstName: patch.firstName } : {}),
          ...(patch.lastName !== undefined ? { lastName: patch.lastName } : {}),
          ...(patch.gender ? { gender: patch.gender } : {}),
        } as any,
        { where: { id: student.userId }, transaction }
      );
    }
  });

  await writeAuditLog({
    action: "update", entity: "student", entityId: student.id, userId: req.user!.id, role: req.user!.role,
    ip: req.ip, newData: { fields: Object.keys(patch) },
  });
  await student.reload();
  ApiResponse.success(res, 200, "Student updated", stripMedical(req, student));
}));

router.delete("/:id", authorize("students:delete"), asyncHandler(async (req, res) => {
  const student = await assertStudentAccess(req, Number(req.params.id));
  await sequelize.transaction((transaction) => deactivateStudent(student, transaction));
  await writeAuditLog({
    action: "update", entity: "student", entityId: student.id, userId: req.user!.id,
    role: req.user!.role, ip: req.ip, newData: { isActive: false },
  });
  ApiResponse.success(res, 200, "Student deactivated", null);
}));

router.patch("/:id/reactivate", authorize("students:update"), asyncHandler(async (req, res) => {
  const student = await assertStudentAccess(req, Number(req.params.id));
  if (student.isActive) return ApiResponse.success(res, 200, "Student is already active", student);
  await sequelize.transaction((transaction) => reactivateStudent(req.user?.branchId, student, transaction));
  await writeAuditLog({
    action: "update", entity: "student", entityId: student.id, userId: req.user!.id,
    role: req.user!.role, ip: req.ip, newData: { isActive: true },
  });
  ApiResponse.success(res, 200, "Student reactivated", student);
}));


/** Everything the student profile drawer needs in one call. */
router.get("/:id/profile", authorize("students:read"), asyncHandler(async (req, res) => {
  const student = await assertStudentAccess(req, Number(req.params.id));
  const perms = await getPermissionsForRole(req.user!.role);
  const can = (p: string) => perms.includes("*") || perms.includes(p);

  const [klass, section, guardians, enrolment, hostelStay, application] = await Promise.all([
    student.currentClassId ? SchoolClass.findByPk(student.currentClassId, { attributes: ["id", "name"] }) : null,
    student.currentSectionId ? Section.findByPk(student.currentSectionId, { attributes: ["id", "name"] }) : null,
    StudentGuardian.findAll({ where: { studentId: student.id } }),
    Enrolment.findOne({ where: { studentId: student.id, status: "active" }, order: [["id", "DESC"]] }),
    can("hostel-allocations:read") ? HostelAllocation.findOne({ where: { studentId: student.id, status: "active" }, include: ["hostel", "room", "bed"] }) : null,
    can("admissions:read") ? AdmissionApplication.findOne({ where: { studentId: student.id }, attributes: ["id", "applicationNo", "dateApplied"] }) : null,
  ]);
  const parentRows = guardians.length ? await Parent.findAll({ where: { id: guardians.map((g) => Number(g.parentId)) } }) : [];
  const byId = new Map(parentRows.map((p) => [Number(p.id), p]));

  const out: Record<string, unknown> = {
    student: stripMedical(req, student),
    className: klass?.name ?? null, sectionName: section?.name ?? null, rollNo: enrolment?.rollNo ?? null,
    guardians: guardians.map((g) => {
      const p = byId.get(Number(g.parentId));
      return { parentId: Number(g.parentId), relation: g.relation, isPrimary: g.isPrimary, fullName: p?.fullName, phone: p?.phone, email: p?.email };
    }),
    application,
  };
  if (hostelStay) {
    const h: any = hostelStay;
    out.hostel = { hostel: h.hostel?.name, room: h.room?.roomNo, bed: h.bed?.bedNo, checkIn: h.checkIn, monthlyFee: h.monthlyFee };
  }
  if (can("attendance:read")) {
    const { start, end } = monthRange(new Date().toISOString().slice(0, 7));
    const rows = await Attendance.findAll({ where: { studentId: student.id, date: { [Op.gte]: start, [Op.lt]: end } }, attributes: ["status"] });
    const summary: Record<string, number> = {};
    for (const r of rows) summary[r.status] = (summary[r.status] || 0) + 1;
    out.attendance = { month: new Date().toISOString().slice(0, 7), summary, total: rows.length };
  }
  if (can("invoices:read") || can("fees:read")) {
    const inv = await Invoice.findAll({ where: { studentId: student.id, status: { [Op.ne]: "cancelled" } }, attributes: ["totalDue", "amountPaid", "status"] });
    const billed = inv.reduce((a, i) => a + Number(i.totalDue), 0);
    const paid = inv.reduce((a, i) => a + Number(i.amountPaid), 0);
    out.fees = { invoices: inv.length, billed, paid, outstanding: Math.max(0, billed - paid), overdue: inv.filter((i) => i.status === "overdue").length };
  }
  ApiResponse.success(res, 200, "Student profile", out);
}));

/** Issue fresh passwords for the student's login and the linked parents (shown once). */
router.post("/:id/reset-logins", authorize("users:update"), asyncHandler(async (req, res) => {
  const student = await assertStudentAccess(req, Number(req.params.id));
  const targets: Array<{ role: string; name: string; userId: number }> = [];
  if (student.userId) targets.push({ role: "student", name: `${student.firstName} ${student.lastName}`.trim(), userId: Number(student.userId) });
  const links = await StudentGuardian.findAll({ where: { studentId: student.id } });
  const parents = links.length ? await Parent.findAll({ where: { id: links.map((l) => Number(l.parentId)) } }) : [];
  for (const p of parents) if (p.userId) targets.push({ role: "parent", name: p.fullName, userId: Number(p.userId) });
  if (!targets.length) throw ApiError.badRequest("This student has no login accounts");
  const credentials = [];
  for (const t of targets) {
    const user = await User.findByPk(t.userId, { attributes: ["id", "username"] });
    if (!user) continue;
    const password = generateRandomPassword();
    await adminResetPassword(t.userId, password, req.user!.id);
    credentials.push({ role: t.role, name: t.name, username: user.username, password });
  }
  ApiResponse.success(res, 200, "New passwords issued. Share them with the family; they are not shown again.", { credentials });
}));

router.get("/:id/guardians", authorize("students:read"), asyncHandler(async (req, res) => {
  const student = await assertStudentAccess(req, Number(req.params.id));
  await student.reload({ include: [{ association: "guardians" }] });
  ApiResponse.success(res, 200, "Guardians", (student as any).guardians || []);
}));

router.get("/:id/attendance", authorize("attendance:read", "students:read"), asyncHandler(async (req, res) => {
  const month = String(req.query.month || new Date().toISOString().slice(0, 7));
  const { start, end } = monthRange(month);
  const rows = await Attendance.findAll({
    where: { studentId: (await assertStudentAccess(req, Number(req.params.id))).id, date: { [Op.gte]: start, [Op.lt]: end } },
  });
  const summary: Record<string, number> = {};
  for (const r of rows) summary[r.status] = (summary[r.status] || 0) + 1;
  ApiResponse.success(res, 200, "Attendance", { month, summary, records: rows });
}));

router.get("/:id/fees", authorize("fees:read", "invoices:read"), asyncHandler(async (req, res) => {
  const student = await assertStudentAccess(req, Number(req.params.id));
  const invoices = await Invoice.findAll({
    where: { studentId: student.id }, include: [{ association: "payments" }],
    order: [["issueDate", "DESC"]],
  });
  ApiResponse.success(res, 200, "Fee summary", invoices);
}));

export default router;
