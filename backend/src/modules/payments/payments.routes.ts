import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate";
import { authorize } from "../../middlewares/authorize";
import asyncHandler from "../../utils/asyncHandler";
import { ApiResponse } from "../../utils/ApiResponse";
import { ApiError } from "../../utils/ApiError";
import { Payment, Receipt, Refund, Invoice } from "../../models";
import { createCrudController } from "../../utils/crudFactory";

const router = Router();
router.use(authenticate);

const base = createCrudController<Payment>({
  model: Payment,
  searchable: ["receiptNo", "method", "status", "reference"],
  defaultSort: [["paidOn", "DESC"]],
});

router.get("/", authorize("payments:read"), (req, res, next) => base.list(req, res).catch(next));
router.get("/:id", authorize("payments:read"), (req, res, next) => base.getOne(req, res).catch(next));
router.delete("/:id", authorize("payments:delete"), (req, res, next) => base.remove(req, res).catch(next));

router.post("/:id/refund", authorize("payments:create"), asyncHandler(async (req, res) => {
  const payment = await Payment.findByPk(req.params.id);
  if (!payment) throw ApiError.notFound("Payment not found");
  if (payment.status !== "successful") throw ApiError.badRequest("Only successful payments can be refunded");

  const amount = Number(req.body.amount ?? payment.amount);
  if (amount > Number(payment.amount)) throw ApiError.badRequest("Refund amount exceeds payment");

  const refund = await Refund.create({
    paymentId: payment.id,
    invoiceId: payment.invoiceId,
    amount,
    method: req.body.method || "bank",
    reason: req.body.reason || "",
    refundedOn: req.body.refundedOn || new Date(),
    status: req.body.approve ? "processed" : "pending",
    approvedBy: req.body.approve ? req.user!.id : null,
  });

  if (req.body.approve) {
    await payment.update({ status: refund.amount >= Number(payment.amount) ? "refunded" : "reversed" });
    const invoice = await Invoice.findByPk(payment.invoiceId);
    if (invoice) {
      const amountPaid = Math.max(0, Number(invoice.amountPaid) - Number(refund.amount));
      await invoice.update({ amountPaid, status: amountPaid >= Number(invoice.totalDue) ? "paid" : amountPaid > 0 ? "partial" : "pending" });
    }
  }

  ApiResponse.success(res, 201, "Refund recorded", refund);
}));

router.get("/receipts/:paymentId", authorize("payments:read"), asyncHandler(async (req, res) => {
  const receipt = await Receipt.findOne({ where: { paymentId: req.params.paymentId } });
  ApiResponse.success(res, 200, "Receipt", receipt);
}));

export default router;