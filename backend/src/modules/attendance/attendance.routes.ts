import { Router } from "express";
import { Op } from "sequelize";
import { authenticate } from "../../middlewares/authenticate";
import { authorize, allowRoles } from "../../middlewares/authorize";
import asyncHandler from "../../utils/asyncHandler";
import { ApiResponse } from "../../utils/ApiResponse";
import { ApiError } from "../../utils/ApiError";
import { Attendance, Enrolment, Student, SchoolClass, Section, StudentGuardian, Parent } from "../../models";
import { ATTENDANCE_STATUS } from "../../utils/constants";
import { monthRange } from "../../utils/dateRange";
import { writeAuditLog } from "../../services/audit.service";

const router = Router();
router.use(authenticate);

// Local-date YYYY-MM-DD helper — avoids UTC-vs-local timezone bug (e.g. Asia/Karachi UTC+5).
function localDateString(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dateFromQuery(req: { query: Record<string, unknown>; body?: Record<string, unknown> }): string {
  const d = String(req.body?.date || req.query.date || localDateString());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw ApiError.badRequest("date must be YYYY-MM-DD");
  return d;
}

function branchFilter(req: { user?: { branchId?: number | null } }): Record<string, unknown> {
  return req.user?.branchId != null ? { branchId: req.user.branchId } : {};
}

async function validateClassScope(classId: number, sectionId: number | undefined, req: any): Promise<void> {
  const cls = await SchoolClass.findByPk(classId);
  if (!cls || !cls.isActive) throw ApiError.badRequest("Class not found or inactive");
  if (req.user?.branchId != null && Number(cls.branchId) !== Number(req.user.branchId)) {
    throw ApiError.forbidden("Class does not belong to your branch");
  }
  if (sectionId !== undefined) {
    const section = await Section.findByPk(sectionId);
    if (!section || !section.isActive || Number(section.classId) !== classId) {
      throw ApiError.badRequest("Selected section does not belong to the selected class");
    }
  }
}

/** Attendance for one class/section on a date (teacher-facing register). */
router.get("/register", authorize("attendance:read"), allowRoles("super_admin","admin","principal","teacher","hostel_warden"), asyncHandler(async (req, res) => {
  const date = dateFromQuery(req);
  const classId = Number(req.query.classId);
  const sectionId = req.query.sectionId ? Number(req.query.sectionId) : undefined;
  if (!Number.isInteger(classId) || classId <= 0) throw ApiError.badRequest("classId required");
  if (sectionId !== undefined && (!Number.isInteger(sectionId) || sectionId <= 0)) throw ApiError.badRequest("Invalid sectionId");
  await validateClassScope(classId, sectionId, req);

  const sectionWhere = sectionId ? { sectionId } : {};
  const scope = branchFilter(req);

  const enrolments = await Enrolment.findAll({
    where: { ...scope, classId, ...sectionWhere, status: "active" },
  });
  let roster: Array<{ studentId: number; rollNo: string | null }> = enrolments.map((e) => ({
    studentId: Number(e.studentId),
    rollNo: e.rollNo,
  }));
  if (!roster.length) {
    const byClass = await Student.findAll({
      where: {
        ...scope,
        currentClassId: classId,
        ...(sectionId ? { currentSectionId: sectionId } : {}),
        isActive: true,
      },
      attributes: ["id"],
    });
    roster = byClass.map((s) => ({ studentId: Number(s.id), rollNo: null }));
  }

  const records = await Attendance.findAll({ where: { ...scope, date, classId, ...sectionWhere } });
  const studentIds = roster.map((r) => r.studentId);
  const students = studentIds.length
    ? await Student.findAll({
        where: { ...scope, id: studentIds },
        attributes: ["id", "firstName", "lastName", "admissionNo"],
      })
    : [];
  const studentById = new Map(students.map((s) => [Number(s.id), s]));

  const byStudent = new Map(records.map((r) => [Number(r.studentId), r]));
  const register = roster.map((r) => {
    const s = studentById.get(r.studentId);
    return {
      studentId: r.studentId,
      studentName: s ? `${s.firstName} ${s.lastName}`.trim() : `#${r.studentId}`,
      admissionNo: s?.admissionNo ?? "",
      rollNo: r.rollNo,
      status: byStudent.get(r.studentId)?.status ?? null,
      lateMinutes: byStudent.get(r.studentId)?.lateMinutes ?? 0,
      reason: byStudent.get(r.studentId)?.reason ?? "",
    };
  });

  ApiResponse.success(res, 200, "Attendance register", { date, classId, sectionId, register });
}));

/** Bulk mark/save attendance for a class on a date. */
router.post("/bulk", authorize("attendance:create", "attendance:update"), asyncHandler(async (req, res) => {
  const date = dateFromQuery(req);
  const { classId, sectionId, entries } = req.body as {
    classId?: number;
    sectionId?: number;
    entries: Array<{ studentId: number; status: string; lateMinutes?: number; reason?: string }>;
  };
  if (!Array.isArray(entries) || !entries.length) throw ApiError.badRequest("entries array required");
  if (!Number.isInteger(Number(classId)) || Number(classId) <= 0) throw ApiError.badRequest("classId required");
  if (sectionId !== undefined && (!Number.isInteger(Number(sectionId)) || Number(sectionId) <= 0)) throw ApiError.badRequest("Invalid sectionId");
  await validateClassScope(Number(classId), sectionId !== undefined ? Number(sectionId) : undefined, req);

  // Derive branchId from the class so super_admin (whose req.user.branchId is null) doesn't
  // accidentally save attendance with branchId=null and then clobber an existing branchId
  // via updateOnDuplicate.
  const cls = await SchoolClass.findByPk(Number(classId));
  const resolvedBranchId = cls?.branchId ?? req.user?.branchId ?? null;
  const scope = resolvedBranchId != null ? { branchId: resolvedBranchId } : {};
  const enrolments = await Enrolment.findAll({
    where: {
      ...scope,
      classId: Number(classId),
      ...(sectionId !== undefined ? { sectionId: Number(sectionId) } : {}),
      status: "active",
    },
    attributes: ["studentId"],
  });

  // Some existing students are assigned through Student.currentClassId/currentSectionId
  // without an Enrolment row. The register endpoint already supports that legacy/current
  // assignment, so bulk save must use the same roster or the UI shows students that cannot
  // actually be saved (e.g. "Student 18 is not enrolled").
  const enrolledIds = enrolments.map(e => Number(e.studentId));
  const fallbackStudents = await Student.findAll({
    where: {
      ...scope,
      currentClassId: Number(classId),
      ...(sectionId !== undefined ? { currentSectionId: Number(sectionId) } : {}),
      isActive: true,
    },
    attributes: ["id"],
  });
  const allowedStudentIds = new Set([
    ...enrolledIds,
    ...fallbackStudents.map(s => Number(s.id)),
  ]);
  const cleaned = entries.map((e) => {
    const studentId = Number(e.studentId);
    if (!allowedStudentIds.has(studentId)) {
      throw ApiError.badRequest(`Student ${studentId} is not enrolled in the selected class/section`);
    }
    const status = String(e.status);
    if (!ATTENDANCE_STATUS.includes(status as any)) {
      throw ApiError.badRequest(`Invalid attendance status for student ${studentId}`);
    }
    const lateMinutes = Number(e.lateMinutes || 0);
    if (!Number.isFinite(lateMinutes) || lateMinutes < 0) {
      throw ApiError.badRequest(`Invalid lateMinutes for student ${studentId}`);
    }
    return {
      ...scope,
      studentId,
      date,
      status,
      lateMinutes,
      reason: e.reason || "",
      takenBy: req.user!.id,
      classId: Number(classId),
      sectionId: sectionId !== undefined ? Number(sectionId) : null,
    };
  });

  const t = await Attendance.sequelize!.transaction();
  try {
    // Use bulkCreate with updateOnDuplicate instead of N+1 sequential upserts.
    // The unique index (studentId, date) makes upsert semantics safe.
    // NOTE: "branchId" is intentionally NOT in the updateOnDuplicate list — it should be
    // set only on INSERT (which the `cleaned` array already does). Overwriting it on every
    // conflict would re-stamp historical rows if a class is ever moved to another branch.
    if (cleaned.length) {
      await Attendance.bulkCreate(cleaned, {
        transaction: t,
        updateOnDuplicate: ["status", "lateMinutes", "reason", "takenBy", "classId", "sectionId", "updatedAt"],
      });
    }
    await t.commit();
  } catch (e) {
    await t.rollback();
    throw e;
  }

  await writeAuditLog({
    action: "update",
    entity: "attendance",
    userId: req.user!.id,
    role: req.user!.role,
    branchId: req.user?.branchId,
    ip: req.ip,
    newData: { date, classId: Number(classId), sectionId, count: cleaned.length },
  });

  ApiResponse.success(res, 200, `Attendance saved for ${cleaned.length} students`, null);
}));

/** Attendance summary across a month/date range. */
router.get("/summary", authorize("attendance:read"), asyncHandler(async (req, res) => {
  const month = String(req.query.month || localDateString().slice(0, 7));
  const classId = req.query.classId ? Number(req.query.classId) : undefined;
  if (classId !== undefined && (!Number.isInteger(classId) || classId <= 0)) throw ApiError.badRequest("Invalid classId");
  if (classId !== undefined) await validateClassScope(classId, undefined, req);

  const { start, end } = monthRange(month);
  const where: Record<string, unknown> = {
    ...branchFilter(req),
    date: { [Op.gte]: start, [Op.lt]: end },
    ...(classId ? { classId } : {}),
  };
  const rows = await Attendance.findAll({ where });
  const perDay: Record<string, Record<string, number>> = {};
  for (const r of rows) {
    if (!perDay[r.date]) perDay[r.date] = {};
    perDay[r.date][r.status] = (perDay[r.date][r.status] || 0) + 1;
  }
  ApiResponse.success(res, 200, "Attendance summary", { month, perDay });
}));

/** Current user's own attendance (student self-service). */
router.get("/me", authorize("attendance:read"), asyncHandler(async (req, res) => {
  const userId = Number(req.user?.id);
  if (!Number.isInteger(userId) || userId <= 0) throw ApiError.unauthorized("Authenticated user required");
  const student = await Student.findOne({ where: { userId } });
  if (!student) throw ApiError.notFound("Student profile not found");
  if (req.user?.branchId != null && Number(student.branchId) !== Number(req.user.branchId)) {
    throw ApiError.forbidden("Student does not belong to your branch");
  }
  const month = String(req.query.month || localDateString().slice(0, 7));
  const { start, end } = monthRange(month);
  const rows = await Attendance.findAll({
    where: { ...branchFilter(req), studentId: student.id, date: { [Op.gte]: start, [Op.lt]: end } },
    order: [["date", "ASC"]],
  });
  ApiResponse.success(res, 200, "My attendance", rows);
}));

/** Per-student monthly record. */
router.get("/student/:studentId", authorize("attendance:read"), asyncHandler(async (req, res) => {
  const studentId = Number(req.params.studentId);
  if (!Number.isInteger(studentId) || studentId <= 0) throw ApiError.badRequest("Invalid studentId");
  const student = await Student.findByPk(studentId);
  if (!student) throw ApiError.notFound("Student not found");
  if (req.user?.role === "student" && Number(student.userId) !== Number(req.user.id)) {
    throw ApiError.forbidden("Students can only view their own attendance");
  }
  if (req.user?.branchId != null && Number(student.branchId) !== Number(req.user.branchId)) {
    throw ApiError.forbidden("Student does not belong to your branch");
  }
  // Parent role: must be linked to this student via Parent → StudentGuardian. Prevents IDOR.
  // Previous bug used `guardianId` column which doesn't exist — parents always got 403.
  if (req.user?.role === "parent") {
    const parent = await Parent.findOne({ where: { userId: req.user!.id } });
    if (!parent) throw ApiError.forbidden("Parent profile not found");
    const link = await StudentGuardian.findOne({ where: { parentId: parent.id, studentId } });
    if (!link) throw ApiError.forbidden("You can only view attendance for your own children");
  }
  const month = String(req.query.month || localDateString().slice(0, 7));
  const { start, end } = monthRange(month);
  const rows = await Attendance.findAll({
    where: { ...branchFilter(req), studentId, date: { [Op.gte]: start, [Op.lt]: end } },
    order: [["date", "ASC"]],
  });
  ApiResponse.success(res, 200, "Student attendance", rows);
}));

export default router;
