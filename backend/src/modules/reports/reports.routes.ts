import { Router } from "express";
import { Op, fn, col } from "sequelize";
import { authenticate } from "../../middlewares/authenticate";
import { authorize } from "../../middlewares/authorize";
import asyncHandler from "../../utils/asyncHandler";
import { ApiResponse } from "../../utils/ApiResponse";
import { ApiError } from "../../utils/ApiError";
import { writeAuditLog } from "../../services/audit.service";
import {
  Student, Teacher, Staff, Invoice, Payment, Attendance, ExamResult, Expense, Enrolment,
} from "../../models";

const router = Router();
router.use(authenticate);

const yearStart = () => new Date(new Date().getFullYear(), 0, 1);

router.get(
  "/students-by-class",
  authorize("reports:read"),
  asyncHandler(async (_req, res) => {
    const rows = await Enrolment.findAll({
      where: { status: "active" },
      attributes: [[fn("COUNT", col("id")), "count"]],
      include: [{ association: "class", attributes: ["name"] }],
      group: ["classId"],
    });
    ApiResponse.success(res, 200, "Students by class", rows);
  })
);

router.get(
  "/attendance-rate",
  authorize("reports:read"),
  asyncHandler(async (req, res) => {
    const from = req.query.from || yearStart();
    const to = req.query.to || new Date();
    const total = await Attendance.count({ where: { date: { [Op.between]: [from, to] } } });
    const present = await Attendance.count({
      where: { date: { [Op.between]: [from, to] }, status: "present" },
    });
    ApiResponse.success(res, 200, "Attendance rate", {
      total,
      present,
      rate: total ? Math.round((present / total) * 10000) / 100 : 0,
    });
  })
);

router.get(
  "/fees",
  authorize("reports:read"),
  asyncHandler(async (req, res) => {
    const from = req.query.from || yearStart();
    const to = req.query.to || new Date();
    const invoiced = await Invoice.sum("totalDue", { where: { issueDate: { [Op.between]: [from, to] } } }) || 0;
    const collected = await Payment.sum("amount", { where: { paidOn: { [Op.between]: [from, to] }, status: "successful" } }) || 0;
    const spent = await Expense.sum("amount", { where: { expensedOn: { [Op.between]: [from, to] }, status: "approved" } }) || 0;
    ApiResponse.success(res, 200, "Fees report", { invoiced, collected, outstanding: invoiced - collected, spent });
  })
);

router.get(
  "/exam-performance",
  authorize("reports:read"),
  asyncHandler(async (req, res) => {
    const examId = Number(req.query.examId);
    if (!examId) throw ApiError.badRequest("examId is required");
    const results = await ExamResult.findAll({ where: { examId } });
    const marks = results.map((r) => Number(r.marksObtained));
    ApiResponse.success(res, 200, "Exam performance", {
      average: marks.length ? marks.reduce((a, b) => a + b, 0) / marks.length : 0,
      highest: marks.length ? Math.max(...marks) : 0,
      lowest: marks.length ? Math.min(...marks) : 0,
      totalStudents: marks.length,
    });
  })
);

router.get(
  "/comparison",
  authorize("reports:read"),
  asyncHandler(async (_req, res) => {
    const [students, teachers, staff, paid, pending] = await Promise.all([
      Student.count(), Teacher.count(), Staff.count(),
      Payment.sum("amount", { where: { status: "successful" } }) || 0,
      Invoice.count({ where: { status: ["pending", "partial"] } }),
    ]);
    ApiResponse.success(res, 200, "Comparison snapshot", {
      students, teachers, staff, ratio: teachers ? Math.round((students / teachers) * 100) / 100 : 0,
      collected: paid, pendingInvoices: pending,
    });
  })
);

router.post(
  "/audit",
  authorize("reports:read"),
  asyncHandler(async (req, res) => {
    const { entity, entityId, action } = req.body as { entity?: string; entityId?: string | number; action?: string };
    await writeAuditLog({
      action: (action as any) ?? "export",
      entity: entity ?? "report",
      entityId,
      userId: req.user!.id,
      role: req.user!.role,
      ip: req.ip,
      newData: req.body,
    });
    ApiResponse.success(res, 200, "Report access recorded", null);
  })
);

export default router;