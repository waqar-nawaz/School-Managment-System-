import { Router } from "express";
import { Op, fn, col } from "sequelize";
import { authenticate } from "../../middlewares/authenticate";
import { authorize } from "../../middlewares/authorize";
import asyncHandler from "../../utils/asyncHandler";
import { ApiResponse } from "../../utils/ApiResponse";
import { ApiError } from "../../utils/ApiError";
import { writeAuditLog } from "../../services/audit.service";
import {
  User, Student, Teacher, Staff, Invoice, Payment, Attendance, ExamResult, Expense, Enrolment,
} from "../../models";

const router = Router();
router.use(authenticate);

const yearStart = () => new Date(new Date().getFullYear(), 0, 1);

/** Coerce a query date to a valid Date (or the fallback). */
function dateParam(value: unknown, fallback: Date): Date {
  if (!value) return fallback;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? fallback : d;
}

/**
 * Reports are cross-entity queries, so the generic CRUD branch filter cannot
 * protect them automatically. For branch-scoped users, every report must
 * constrain through the branch-owned entity (normally Student or User).
 */
function branchIdOf(req: any): number | undefined {
  const branchId = Number(req.user?.branchId);
  return Number.isFinite(branchId) && branchId > 0 ? branchId : undefined;
}

async function branchStudentIds(branchId?: number): Promise<number[] | undefined> {
  if (!branchId) return undefined;
  const rows = await Student.findAll({ where: { branchId }, attributes: ["id"], raw: true });
  return rows.map((row: any) => Number(row.id));
}

async function branchTeacherStaffUserIds(
  Model: any,
  branchId?: number,
): Promise<number[] | undefined> {
  if (!branchId) return undefined;
  const rows = await Model.findAll({ attributes: ["userId"], where: { userId: { [Op.ne]: null } }, raw: true });
  const userIds = rows.map((row: any) => Number(row.userId)).filter(Boolean);
  if (!userIds.length) return [];
  const users = await User.findAll({
    where: { id: { [Op.in]: userIds }, branchId },
    attributes: ["id"],
    raw: true,
  });
  return users.map((row: any) => Number(row.id));
}

router.get(
  "/students-by-class",
  authorize("reports:read"),
  asyncHandler(async (req, res) => {
    const branchId = branchIdOf(req);
    const where: any = { status: "active" };
    const studentWhere = branchId ? { branchId } : undefined;
    const rows = await Enrolment.findAll({
      where,
      attributes: ["classId", [fn("COUNT", col("Enrolment.id")), "count"]],
      include: [
        { association: "class", attributes: ["id", "name"] },
        ...(studentWhere ? [{ model: Student, required: true, where: studentWhere, attributes: [] }] : []),
      ],
      group: ["Enrolment.classId", "class.id", "class.name"],
    });
    ApiResponse.success(res, 200, "Students by class", rows);
  })
);

router.get(
  "/attendance-rate",
  authorize("reports:read"),
  asyncHandler(async (req, res) => {
    const from = dateParam(req.query.from, yearStart());
    const to = dateParam(req.query.to, new Date());
    const studentIds = await branchStudentIds(branchIdOf(req));
    const studentWhere = studentIds ? { studentId: { [Op.in]: studentIds } } : {};
    const dateWhere = { date: { [Op.between]: [from, to] }, ...studentWhere };
    const total = await Attendance.count({ where: dateWhere });
    const present = await Attendance.count({ where: { ...dateWhere, status: "present" } });
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
    const from = dateParam(req.query.from, yearStart());
    const to = dateParam(req.query.to, new Date());
    const branchId = branchIdOf(req);

    const invoiceWhere: any = { issueDate: { [Op.between]: [from, to] } };
    const paymentWhere: any = { paidOn: { [Op.between]: [from, to] }, status: "successful" };
    if (branchId) {
      invoiceWhere["$student.branchId$"] = branchId;
      paymentWhere["$student.branchId$"] = branchId;
    }

    const invoiced = await Invoice.sum("totalDue", {
      where: invoiceWhere,
      include: branchId ? [{ association: "student", attributes: [], required: true }] : [],
    }) || 0;

    const collected = await Payment.sum("amount", {
      where: paymentWhere,
      include: branchId ? [{ model: Student, attributes: [], required: true, where: { branchId } }] : [],
    }) || 0;

    let spentWhere: any = { expensedOn: { [Op.between]: [from, to] }, status: "approved" };
    if (branchId) {
      const userIds = await User.findAll({ where: { branchId }, attributes: ["id"], raw: true });
      spentWhere.createdBy = { [Op.in]: userIds.map((u: any) => Number(u.id)) };
    }
    const spent = await Expense.sum("amount", { where: spentWhere }) || 0;

    ApiResponse.success(res, 200, "Fees report", {
      invoiced, collected, outstanding: invoiced - collected, spent,
    });
  })
);

router.get(
  "/exam-performance",
  authorize("reports:read"),
  asyncHandler(async (req, res) => {
    const examId = Number(req.query.examId);
    if (!examId) throw ApiError.badRequest("examId is required");
    const studentIds = await branchStudentIds(branchIdOf(req));
    const where: any = { examId };
    if (studentIds) where.studentId = { [Op.in]: studentIds };
    const results = await ExamResult.findAll({ where });
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
  asyncHandler(async (req, res) => {
    const branchId = branchIdOf(req);
    const studentWhere: any = {};
    const teacherWhere: any = {};
    const staffWhere: any = {};
    if (branchId) {
      studentWhere.branchId = branchId;
      const [teacherUserIds, staffUserIds] = await Promise.all([
        branchTeacherStaffUserIds(Teacher, branchId),
        branchTeacherStaffUserIds(Staff, branchId),
      ]);
      teacherWhere.userId = teacherUserIds?.length ? { [Op.in]: teacherUserIds } : { [Op.in]: [-1] };
      staffWhere.userId = staffUserIds?.length ? { [Op.in]: staffUserIds } : { [Op.in]: [-1] };
    }

    const [students, teachers, staff, paid, pending] = await Promise.all([
      Student.count({ where: studentWhere }),
      Teacher.count({ where: teacherWhere }),
      Staff.count({ where: staffWhere }),
      Payment.sum("amount", {
        where: branchId ? { status: "successful" } : { status: "successful" },
        ...(branchId ? { include: [{ model: Student, required: true, where: { branchId }, attributes: [] }] } : {}),
      } as any) || 0,
      Invoice.count({
        where: branchId ? { status: { [Op.in]: ["pending", "partial"] } } : { status: { [Op.in]: ["pending", "partial"] } },
        ...(branchId ? { include: [{ association: "student", required: true, where: { branchId }, attributes: [] }] } : {}),
      } as any),
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
