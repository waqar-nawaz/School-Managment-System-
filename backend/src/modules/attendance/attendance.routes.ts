import { Router } from "express";
import { Op } from "sequelize";
import { authenticate } from "../../middlewares/authenticate";
import { authorize } from "../../middlewares/authorize";
import asyncHandler from "../../utils/asyncHandler";
import { ApiResponse } from "../../utils/ApiResponse";
import { ApiError } from "../../utils/ApiError";
import { Attendance, Enrolment, Student, SchoolClass, Section } from "../../models";
import { ATTENDANCE_STATUS } from "../../utils/constants";
import { monthRange } from "../../utils/dateRange";

const router = Router();
router.use(authenticate);

function dateFromQuery(req: { query: Record<string, unknown>; body?: Record<string, unknown> }): string {
  const d = String(req.body?.date || req.query.date || new Date().toISOString().slice(0, 10));
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
router.get("/register", authorize("attendance:read"), asyncHandler(async (req, res) => {
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

  const scope = branchFilter(req);
  const enrolments = await Enrolment.findAll({
    where: {
      ...scope,
      classId: Number(classId),
      ...(sectionId !== undefined ? { sectionId: Number(sectionId) } : {}),
      status: "active",
    },
    attributes: ["studentId"],
  });
  const allowedStudentIds = new Set(enrolments.map(e => Number(e.studentId)));
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
    for (const row of cleaned) await Attendance.upsert(row, { transaction: t });
    await t.commit();
  } catch (e) {
    await t.rollback();
    throw e;
  }

  ApiResponse.success(res, 200, `Attendance saved for ${cleaned.length} students`, null);
}));

/** Attendance summary across a month/date range. */
router.get("/summary", authorize("attendance:read"), asyncHandler(async (req, res) => {
  const month = String(req.query.month || new Date().toISOString().slice(0, 7));
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

/** Per-student monthly record. */
router.get("/student/:studentId", authorize("attendance:read"), asyncHandler(async (req, res) => {
  const studentId = Number(req.params.studentId);
  if (!Number.isInteger(studentId) || studentId <= 0) throw ApiError.badRequest("Invalid studentId");
  const student = await Student.findByPk(studentId);
  if (!student) throw ApiError.notFound("Student not found");
  if (req.user?.branchId != null && Number(student.branchId) !== Number(req.user.branchId)) {
    throw ApiError.forbidden("Student does not belong to your branch");
  }
  const month = String(req.query.month || new Date().toISOString().slice(0, 7));
  const { start, end } = monthRange(month);
  const rows = await Attendance.findAll({
    where: { ...branchFilter(req), studentId, date: { [Op.gte]: start, [Op.lt]: end } },
    order: [["date", "ASC"]],
  });
  ApiResponse.success(res, 200, "Student attendance", rows);
}));

export default router;
