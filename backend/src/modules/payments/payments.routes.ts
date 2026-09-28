import { Router } from "express";
import { Op } from "sequelize";
import { authenticate } from "../../middlewares/authenticate";
import { authorize } from "../../middlewares/authorize";
import asyncHandler from "../../utils/asyncHandler";
import { ApiResponse } from "../../utils/ApiResponse";
import { ApiError } from "../../utils/ApiError";
import { Payment, Receipt, Refund, Invoice } from "../../models";
import { createCrudController } from "../../utils/crudFactory";
import { writeAuditLog } from "../../services/audit.service";
import { v4 as uuidv4 } from "uuid";

const router = Router();
router.use(authenticate);

const base = createCrudController<Payment>({
  model: Payment,
  searchable: ["receiptNo", "method", "status", "reference"],
  defaultSort: [["paidOn", "DESC"]],
  allowedFilters: ["status", "method", "studentId", "invoiceId", "branchId", "paidOn"],
});

router.get("/", authorize("payments:read"), (req, res, next) => base.list(req, res).catch(next));
router.get("/:id", authorize("payments:read"), (req, res, next) => base.getOne(req, res).catch(next));
// DELETE on payments is intentionally disabled — financial records must not be hard-deleted.
// Use POST /:id/refund with approve=true to void a payment.
// router.delete("/:id", authorize("payments:delete"), (req, res, next) => base.remove(req, res).catch(next));

router.post("/:id/refund", authorize("payments:create"), asyncHandler(async (req, res) => {
  const amount = Number(req.body.amount ?? 0);
  if (!(amount > 0)) throw ApiError.badRequest("Refund amount must be positive");
  const callerBranch = req.user!.branchId;

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
    const refundable = Number(payment.amount) - Number(prior || 0);
    if (amount > refundable) throw ApiError.badRequest(`Refund exceeds refundable payment balance of ${refundable}`);

    const refund = await Refund.create({
      paymentId: payment.id,
      invoiceId: payment.invoiceId,
      branchId: payment.branchId,
      amount,
      method: req.body.method || "bank",
      reason: req.body.reason || "",
      refundedOn: req.body.refundedOn || new Date(),
      status: req.body.approve ? "processed" : "pending",
      approvedBy: req.body.approve ? req.user!.id : null,
    }, { transaction: t });

    if (req.body.approve) {
      await payment.update({ status: amount >= Number(payment.amount) ? "refunded" : "reversed" }, { transaction: t });
      const invoice = await Invoice.findByPk(payment.invoiceId, { transaction: t, lock: t.LOCK.UPDATE });
      if (invoice) {
        const amountPaid = Math.max(0, Number(invoice.amountPaid) - amount);
        await invoice.update({
          amountPaid,
          status: amountPaid >= Number(invoice.totalDue) ? "paid" : amountPaid > 0 ? "partial" : "pending",
        }, { transaction: t });
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
    });

    await t.commit();
    ApiResponse.success(res, 201, "Refund recorded", refund);
  } catch (e) {
    await t.rollback();
    throw e;
  }
}));

router.get("/receipts/:paymentId", authorize("payments:read"), asyncHandler(async (req, res) => {
  const receipt = await Receipt.findOne({ where: { paymentId: req.params.paymentId } });
  ApiResponse.success(res, 200, "Receipt", receipt);
}));

export default router;