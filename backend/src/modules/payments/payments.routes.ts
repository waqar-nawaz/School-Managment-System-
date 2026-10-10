import { Router } from "express";
import { Op } from "sequelize";
import { authenticate } from "../../middlewares/authenticate";
import { authorize } from "../../middlewares/authorize";
import asyncHandler from "../../utils/asyncHandler";
import { ApiResponse } from "../../utils/ApiResponse";
import { ApiError } from "../../utils/ApiError";
import { Payment, Receipt, Refund, Invoice } from "../../models";
import { createCrudController } from "../../utils/crudFactory";
import { studentScope } from "../../utils/access";
import { getPermissionsForRole } from "../../services/rbac.service";
import { round2, parseMoney, PAYMENT_METHODS } from "../../utils/money";
import { writeAuditLog } from "../../services/audit.service";
import { v4 as uuidv4 } from "uuid";

const router = Router();
router.use(authenticate);

const base = createCrudController<Payment>({
  model: Payment,
  searchable: ["receiptNo", "method", "status", "reference"],
  defaultSort: [["paidOn", "DESC"]],
  allowedFilters: ["status", "method", "studentId", "invoiceId", "branchId", "paidOn"],
  scopeWhere: (req) => studentScope(req, "studentId"),
  includes: [
    { association: "invoice", attributes: ["id", "invoiceNo", "totalDue", "amountPaid", "status"] },
    { association: "student", attributes: ["id", "firstName", "lastName", "admissionNo"] },
  ],
  decorate: (row: any) => {
    const p = row && typeof row.get === "function" ? row.get({ plain: true }) : { ...row };
    p.invoiceNo = p.invoice?.invoiceNo ?? "";
    p.studentName = p.student ? `${p.student.firstName} ${p.student.lastName}`.trim() : "";
    p.admissionNo = p.student?.admissionNo ?? "";
    return p;
  },
});

/**
 * A payment stays "successful" while only PARTLY refunded (so further partial refunds stay possible
 * and reports keep counting the money that was actually received); it becomes "refunded" once the
 * processed refunds cover the full amount.
 */
async function syncPaymentStatus(payment: Payment, transaction: any): Promise<void> {
  const processed = await Refund.sum("amount", { where: { paymentId: payment.id, status: "processed" }, transaction });
  await payment.update({ status: Number(processed || 0) >= Number(payment.amount) ? "refunded" : "successful" }, { transaction });
}

router.get("/", authorize("payments:read"), (req, res, next) => base.list(req, res).catch(next));
// IMPORTANT: GET /receipts/:paymentId MUST come before GET /:id, otherwise Express matches "receipts" as an id param.
// Pending refund requests awaiting approval (must stay before GET /:id).
router.get("/refunds/pending", authorize("refunds:approve", "refunds:create"), asyncHandler(async (req, res) => {
  const rows: any[] = await Refund.findAll({
    where: { status: "pending", ...(req.user!.branchId != null ? { branchId: req.user!.branchId } : {}) },
    include: [{
      association: "payment",
      attributes: ["id", "receiptNo", "amount", "method", "reference", "paidOn"],
      include: [
        { association: "student", attributes: ["firstName", "lastName", "admissionNo"] },
        { association: "invoice", attributes: ["invoiceNo"] },
      ],
    }],
    order: [["createdAt", "DESC"]],
    limit: 200,
  });
  const data = rows.map((r) => {
    const p = r.payment;
    return {
      id: r.id, paymentId: r.paymentId, amount: r.amount, reason: r.reason, method: r.method,
      requestedBy: r.requestedBy, createdAt: r.createdAt,
      receiptNo: p?.receiptNo ?? "", paymentAmount: p?.amount ?? null, invoiceNo: p?.invoice?.invoiceNo ?? "",
      studentName: p?.student ? `${p.student.firstName} ${p.student.lastName}`.trim() : "",
      admissionNo: p?.student?.admissionNo ?? "",
    };
  });
  ApiResponse.success(res, 200, "Pending refunds", data);
}));

router.get("/receipts/:paymentId", authorize("payments:read"), asyncHandler(async (req, res) => {
  const callerBranch = req.user!.branchId;
  const where: any = { paymentId: req.params.paymentId };
  // Branch-scope the lookup to prevent cross-tenant receipt access (IDOR).
  if (callerBranch != null) where.branchId = callerBranch;
  // Parents/students may only open receipts of their own payments.
  const own = await Payment.findOne({ where: { id: Number(req.params.paymentId), ...(await studentScope(req, "studentId")) }, attributes: ["id"] });
  if (!own) throw ApiError.notFound("Receipt not found");
  const receipt = await Receipt.findOne({
    where,
    include: [{ association: "payment" }, { association: "invoice" }],
  });
  if (!receipt) throw ApiError.notFound("Receipt not found");
  ApiResponse.success(res, 200, "Receipt", receipt);
}));
router.get("/:id", authorize("payments:read"), (req, res, next) => base.getOne(req, res).catch(next));
// DELETE on payments is intentionally disabled — financial records must not be hard-deleted.
// Use POST /:id/refund with approve=true to void a payment.
// router.delete("/:id", authorize("payments:delete"), (req, res, next) => base.remove(req, res).catch(next));

router.post("/:id/refund", authorize("refunds:create"), asyncHandler(async (req, res) => {
  const amount = parseMoney(req.body.amount, "Refund amount");
  const reason = String(req.body.reason ?? "").trim();
  if (reason.length < 3) throw ApiError.badRequest("Please write the reason for the refund");
  if (reason.length > 500) throw ApiError.badRequest("The refund reason is too long (max 500 characters)");
  const refundMethod = String(req.body.method || "bank").toLowerCase();
  if (!(PAYMENT_METHODS as readonly string[]).includes(refundMethod)) throw ApiError.badRequest(`Invalid refund method: ${refundMethod}`);
  const callerBranch = req.user!.branchId;
  // Creating a refund and approving it are separate controls: approve:true needs refunds:approve,
  // and (maker-checker) only an administrator may request AND approve the same refund.
  if (req.body.approve) {
    const perms = await getPermissionsForRole(req.user!.role);
    if (!perms.includes("*") && !perms.includes("refunds:approve")) {
      throw ApiError.forbidden("Missing permission: refunds:approve (submit the refund without approve to send it for approval)");
    }
    if (!perms.includes("*")) {
      throw ApiError.forbidden("A refund you requested must be approved by someone else. Submit it without approve and ask the principal or an administrator to approve it.");
    }
  }

  // Lock the Payment row inside the transaction before computing prior refunds.
  // This closes the race condition where two concurrent refunds both read prior=0
  // and both pass the refundable check, causing an over-refund.
  const t = await Payment.sequelize!.transaction();
  try {
    const payment = await Payment.findByPk(req.params.id, { transaction: t, lock: t.LOCK.UPDATE });
    if (!payment) throw ApiError.notFound("Payment not found");
    if (callerBranch != null && Number(payment.branchId) !== Number(callerBranch)) {
      throw ApiError.forbidden("Payment does not belong to your branch");
    }
    if (payment.status !== "successful") throw ApiError.badRequest("Only successful payments can be refunded");

    const prior = await Refund.sum("amount", {
      where: { paymentId: payment.id, status: { [Op.in]: ["pending", "processed"] } },
      transaction: t,
    });
    const refundable = round2(Number(payment.amount) - Number(prior || 0));
    if (amount > refundable) throw ApiError.badRequest(`Refund exceeds refundable payment balance of ${refundable}`);

    const refundedOn = req.body.refundedOn ? new Date(req.body.refundedOn) : new Date();
    if (!Number.isFinite(refundedOn.getTime())) throw ApiError.badRequest("Refund date is not valid");
    if (refundedOn.getTime() > Date.now() + 86400000) throw ApiError.badRequest("Refund date cannot be in the future");

    const refund = await Refund.create({
      paymentId: payment.id,
      invoiceId: payment.invoiceId,
      branchId: payment.branchId,
      amount,
      method: refundMethod,
      reason,
      refundedOn,
      status: req.body.approve ? "processed" : "pending",
      requestedBy: req.user!.id,
      approvedBy: req.body.approve ? req.user!.id : null,
    }, { transaction: t });

    if (req.body.approve) {
      await syncPaymentStatus(payment, t);
      const invoice = await Invoice.findByPk(payment.invoiceId, { transaction: t, lock: t.LOCK.UPDATE });
      if (invoice && invoice.status !== "cancelled") {
        const amountPaid = Math.max(0, round2(Number(invoice.amountPaid) - amount));
        const isOverdue = new Date(invoice.dueDate) < new Date();
        const nextStatus = amountPaid >= Number(invoice.totalDue) ? "paid"
          : amountPaid > 0 ? "partial"
          : isOverdue ? "overdue"
          : "pending";
        await invoice.update({ amountPaid, status: nextStatus }, { transaction: t });
      }
    }

    await writeAuditLog({
      action: "create",
      entity: "refund",
      entityId: refund.id,
      userId: req.user!.id,
      role: req.user!.role,
      branchId: payment.branchId,
      ip: req.ip,
      newData: { paymentId: payment.id, amount, approved: !!req.body.approve },
    }, t);

    await t.commit();
    ApiResponse.success(res, 201, "Refund recorded", refund);
  } catch (e) {
    await t.rollback();
    throw e;
  }
}));

// Approve a pending refund. Transitions status from 'pending' to 'processed',
// applies the refund to the Payment + Invoice inside a transaction.
// Requires refunds:approve (a distinct financial control from payments:create).
router.patch("/:id/refunds/:refundId/approve", authorize("refunds:approve"), asyncHandler(async (req, res) => {
  const callerBranch = req.user!.branchId;
  const t = await Payment.sequelize!.transaction();
  try {
    const payment = await Payment.findByPk(req.params.id, { transaction: t, lock: t.LOCK.UPDATE });
    if (!payment) throw ApiError.notFound("Payment not found");
    if (callerBranch != null && Number(payment.branchId) !== Number(callerBranch)) {
      throw ApiError.forbidden("Payment does not belong to your branch");
    }
    const refund = await Refund.findByPk(req.params.refundId, { transaction: t, lock: t.LOCK.UPDATE });
    if (!refund) throw ApiError.notFound("Refund not found");
    if (Number(refund.paymentId) !== Number(payment.id)) {
      throw ApiError.badRequest("Refund does not belong to this payment");
    }
    if (refund.status !== "pending") {
      throw ApiError.badRequest(`Refund is already ${refund.status}`);
    }

    if (refund.requestedBy && Number(refund.requestedBy) === Number(req.user!.id)) {
      const perms = await getPermissionsForRole(req.user!.role);
      if (!perms.includes("*")) throw ApiError.forbidden("You requested this refund, so someone else must approve it.");
    }
    await refund.update({ status: "processed", approvedBy: req.user!.id, refundedOn: new Date() }, { transaction: t });
    await syncPaymentStatus(payment, t);

    const invoice = await Invoice.findByPk(payment.invoiceId, { transaction: t, lock: t.LOCK.UPDATE });
    // Guard: never overwrite a 'cancelled' invoice status (terminal state).
    if (invoice && invoice.status !== "cancelled") {
      const amountPaid = Math.max(0, round2(Number(invoice.amountPaid) - Number(refund.amount)));
      const isOverdue = new Date(invoice.dueDate) < new Date();
      const nextStatus = amountPaid >= Number(invoice.totalDue) ? "paid"
        : amountPaid > 0 ? "partial"
        : isOverdue ? "overdue"
        : "pending";
      await invoice.update({ amountPaid, status: nextStatus }, { transaction: t });
    }

    await writeAuditLog({
      action: "update",
      entity: "refund",
      entityId: refund.id,
      userId: req.user!.id,
      role: req.user!.role,
      branchId: payment.branchId,
      ip: req.ip,
      oldData: { status: "pending" },
      newData: { status: "processed", amount: refund.amount },
    }, t);

    await t.commit();
    ApiResponse.success(res, 200, "Refund approved", refund);
  } catch (e) {
    await t.rollback();
    throw e;
  }
}));

// GET /payments/receipts/:paymentId is registered above (before /:id) to avoid route shadowing.
// GET /payments/:id/refunds — list refunds for a payment (read-only audit).
router.get("/:id/refunds", authorize("payments:read"), asyncHandler(async (req, res) => {
  const paymentId = Number(req.params.id);
  if (!Number.isInteger(paymentId) || paymentId <= 0) throw ApiError.badRequest("Invalid paymentId");
  const callerBranch = req.user!.branchId;
  const where: any = { paymentId };
  if (callerBranch != null) where.branchId = callerBranch;
  if (!(await Payment.findOne({ where: { id: paymentId, ...(await studentScope(req, "studentId")) }, attributes: ["id"] }))) {
    throw ApiError.notFound("Payment not found");
  }
  const refunds = await Refund.findAll({ where, order: [["refundedOn", "DESC"]] });
  ApiResponse.success(res, 200, "Refunds", refunds);
}));

// Reject a pending refund. Transitions status from 'pending' to 'rejected'.
// Requires refunds:approve (same financial control as approve).
router.patch("/:id/refunds/:refundId/reject", authorize("refunds:approve"), asyncHandler(async (req, res) => {
  const callerBranch = req.user!.branchId;
  const t = await Payment.sequelize!.transaction();
  try {
    const payment = await Payment.findByPk(req.params.id, { transaction: t, lock: t.LOCK.UPDATE });
    if (!payment) throw ApiError.notFound("Payment not found");
    if (callerBranch != null && Number(payment.branchId) !== Number(callerBranch)) {
      throw ApiError.forbidden("Payment does not belong to your branch");
    }
    const refund = await Refund.findByPk(req.params.refundId, { transaction: t, lock: t.LOCK.UPDATE });
    if (!refund) throw ApiError.notFound("Refund not found");
    if (Number(refund.paymentId) !== Number(payment.id)) {
      throw ApiError.badRequest("Refund does not belong to this payment");
    }
    if (refund.status !== "pending") {
      throw ApiError.badRequest(`Refund is already ${refund.status}`);
    }
    const reason = String(req.body.reason ?? "").trim();
    await refund.update({ status: "rejected", reason: reason || refund.reason }, { transaction: t });
    await writeAuditLog({
      action: "update", entity: "refund", entityId: refund.id,
      userId: req.user!.id, role: req.user!.role, branchId: payment.branchId, ip: req.ip,
      oldData: { status: "pending" }, newData: { status: "rejected", reason },
    }, t);
    await t.commit();
    ApiResponse.success(res, 200, "Refund rejected", refund);
  } catch (e) {
    await t.rollback();
    throw e;
  }
}));

export default router;