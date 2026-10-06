import { Router } from "express";
import { Op, fn, col } from "sequelize";
import { authenticate } from "../../middlewares/authenticate";
import { authorize } from "../../middlewares/authorize";
import asyncHandler from "../../utils/asyncHandler";
import { ApiResponse } from "../../utils/ApiResponse";
import { ApiError } from "../../utils/ApiError";
import { writeAuditLog } from "../../services/audit.service";
import {
  User, Student, Teacher, Staff, Invoice, Payment, Attendance, ExamResult, Expense, Enrolment, Refund,
} from "../../models";

const router = Router();
router.use(authenticate);

// Money that actually came in: fully/partly refunded payments were still received, and the refunds
// are subtracted separately. (Counting only "successful" payments AND subtracting refunds removed
// every fully refunded rupee twice.)
const RECEIVED_STATUSES = ["successful", "refunded", "reversed"];

const yearStart = () => new Date(new Date().getFullYear(), 0, 1);

/** Coerce a query date to a valid Date (or the fallback). */
function dateParam(value: unknown, fallback: Date, endOfDay = false): Date {
  if (!value) return fallback;
  const raw = String(value).trim();
  // Date-only filters must include the entire selected day. Use UTC explicitly so
  // the API behaves consistently on Render and local development machines.
  const d = /^\\d{4}-\\d{2}-\\d{2}$/.test(raw)
    ? new Date(`${raw}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`)
    : new Date(raw);
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
    const to = dateParam(req.query.to, new Date(), true);
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

    // Exclude cancelled invoices — they should not contribute to invoiced total.
    const invoiceWhere: any = {
      issueDate: { [Op.between]: [from, to] },
      status: { [Op.ne]: "cancelled" },
    };
    const paymentWhere: any = { paidOn: { [Op.between]: [from, to] }, status: { [Op.in]: RECEIVED_STATUSES } };
    if (branchId) {
      // Now that Invoice has branchId, filter directly rather than via student IDs.
      invoiceWhere.branchId = branchId;
      paymentWhere.branchId = branchId;
    }

    const invoiced = await Invoice.sum("totalDue", { where: invoiceWhere }) || 0;
    const collected = await Payment.sum("amount", { where: paymentWhere }) || 0;
    // Refunds are reported separately; net = collected - refunded.
    const refundWhere: any = { refundedOn: { [Op.between]: [from, to] }, status: "processed" };
    if (branchId) refundWhere.branchId = branchId;
    const refunded = await Refund.sum("amount", { where: refundWhere }) || 0;

    let spentWhere: any = { expensedOn: { [Op.between]: [from, to] }, status: { [Op.in]: ["approved", "paid"] } };
    if (branchId) {
      spentWhere.branchId = branchId;
    }
    const spent = await Expense.sum("amount", { where: spentWhere }) || 0;

    // Outstanding = sum of unpaid balances on invoices issued in the range.
    // Previous calc (invoiced - collected) was wrong when invoice issueDate and payment paidOn
    // fell in different reporting periods.
    const outstandingInvoices = await Invoice.findAll({
      where: invoiceWhere,
      attributes: ["totalDue", "amountPaid"],
      raw: true,
    });
    const outstanding = outstandingInvoices.reduce(
      (sum, inv) => sum + Math.max(0, Number(inv.totalDue) - Number(inv.amountPaid)),
      0
    );

    ApiResponse.success(res, 200, "Fees report", {
      invoiced, collected, refunded, net: collected - refunded, outstanding, spent,
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
      (async () => {
        const where: any = { status: { [Op.in]: RECEIVED_STATUSES } };
        if (branchId) {
          where.branchId = branchId;
        }
        const collected = (await Payment.sum("amount", { where })) || 0;
        // Net of processed refunds.
        const refundWhere: any = { status: "processed" };
        if (branchId) refundWhere.branchId = branchId;
        const refunded = (await Refund.sum("amount", { where: refundWhere })) || 0;
        return collected - refunded;
      })(),
      (async () => {
        const where: any = { status: { [Op.in]: ["pending", "partial", "overdue"] } };
        if (branchId) {
          where.branchId = branchId;
        }
        return Invoice.count({ where });
      })(),
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
    // Restrict to a fixed allow-list so users can't inject arbitrary audit entries.
    // Audit logs must not be pollutable by arbitrary clients.
    const ALLOWED_ACTIONS = new Set(["export", "download", "view"]);
    const ALLOWED_ENTITIES = new Set([
      "students", "teachers", "staff", "invoices", "payments", "attendance",
      "report", "certificate", "refund",
    ]);
    const action = String(req.body.action ?? "view").toLowerCase();
    const entity = String(req.body.entity ?? "report").toLowerCase();
    if (!ALLOWED_ACTIONS.has(action)) {
      throw ApiError.badRequest(`Invalid audit action. Allowed: ${[...ALLOWED_ACTIONS].join(", ")}`);
    }
    if (!ALLOWED_ENTITIES.has(entity)) {
      throw ApiError.badRequest(`Invalid audit entity. Allowed: ${[...ALLOWED_ENTITIES].join(", ")}`);
    }
    await writeAuditLog({
      action: action as any,
      entity,
      entityId: req.body.entityId,
      userId: req.user!.id,
      role: req.user!.role,
      branchId: req.user!.branchId,
      ip: req.ip,
      newData: { source: "reports_endpoint" },
    });
    ApiResponse.success(res, 200, "Report access recorded", null);
  })
);

export default router;
