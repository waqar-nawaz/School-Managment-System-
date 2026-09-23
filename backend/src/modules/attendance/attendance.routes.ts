import { Router } from "express";
import { Op } from "sequelize";
import { authenticate } from "../../middlewares/authenticate";
import { authorize } from "../../middlewares/authorize";
import asyncHandler from "../../utils/asyncHandler";
import { ApiResponse } from "../../utils/ApiResponse";
import { ApiError } from "../../utils/ApiError";
import { Attendance, Enrolment } from "../../models";
import { ATTENDANCE_STATUS } from "../../utils/constants";
import { monthRange } from "../../utils/dateRange";

const router = Router();
router.use(authenticate);

function dateFromQuery(req: { query: Record<string, unknown>; body?: Record<string, unknown> }): string {
  const d = String(req.body?.date || req.query.date || new Date().toISOString().slice(0, 10));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw ApiError.badRequest("date must be YYYY-MM-DD");
  return d;
}

/** Attendance for one class/section on a date (teacher-facing register). */
router.get("/register", authorize("attendance:read"), asyncHandler(async (req, res) => {
  const date = dateFromQuery(req);
  const classId = Number(req.query.classId);
  const sectionId = req.query.sectionId ? Number(req.query.sectionId) : undefined;
  if (!classId) throw ApiError.badRequest("classId required");

  const enrolments = await Enrolment.findAll({
    where: { classId, ...(sectionId ? { sectionId } : {}), status: "active" },
  });
  const records = await Attendance.findAll({ where: { date, classId, ...(sectionId ? { sectionId } : {}) } });

  const byStudent = new Map(records.map((r) => [r.studentId, r]));
  const register = enrolments.map((e) => ({
    studentId: e.studentId,
    rollNo: e.rollNo,
    status: byStudent.get(e.studentId)?.status ?? null,
    lateMinutes: byStudent.get(e.studentId)?.lateMinutes ?? 0,
    reason: byStudent.get(e.studentId)?.reason ?? "",
  }));

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
  if (!Array.isArray(entries)) throw ApiError.badRequest("entries array required");

  const cleaned = entries.map((e) => ({
    studentId: e.studentId,
    date,
    status: ATTENDANCE_STATUS.includes(e.status as any) ? e.status : "present",
    lateMinutes: Number(e.lateMinutes || 0),
    reason: e.reason || "",
    takenBy: req.user!.id,
    classId: classId ?? null,
    sectionId: sectionId ?? null,
  }));

  const t = await Attendance.sequelize!.transaction();
  try {
    for (const row of cleaned) {
      await Attendance.upsert(row, { transaction: t });
    }
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

  const { start, end } = monthRange(month);
  const where: Record<string, unknown> = {
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
  const month = String(req.query.month || new Date().toISOString().slice(0, 7));
  const { start, end } = monthRange(month);
  const rows = await Attendance.findAll({
    where: { studentId: req.params.studentId, date: { [Op.gte]: start, [Op.lt]: end } },
    order: [["date", "ASC"]],
  });
  ApiResponse.success(res, 200, "Student attendance", rows);
}));

export default router;