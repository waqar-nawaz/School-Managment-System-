import { Router } from "express";
import { Op } from "sequelize";
import { authenticate } from "../../middlewares/authenticate";
import { authorize } from "../../middlewares/authorize";
import asyncHandler from "../../utils/asyncHandler";
import { ApiResponse } from "../../utils/ApiResponse";
import { ApiError } from "../../utils/ApiError";
import { Invoice, FeeType, Student, Enrolment, Term, Payment, Receipt } from "../../models";
import { createCrudController } from "../../utils/crudFactory";
import { writeAuditLog } from "../../services/audit.service";

const router = Router();
router.use(authenticate);

const base = createCrudController<Invoice>({
  model: Invoice,
  searchable: ["invoiceNo", "status"],
  defaultSort: [["issueDate", "DESC"]],
  includes: [{ association: "payments" }, { association: "student" }],
});

router.get("/", authorize("invoices:read"), (req, res, next) => base.list(req, res).catch(next));
router.get("/:id", authorize("invoices:read"), (req, res, next) => base.getOne(req, res).catch(next));
router.put("/:id", authorize("invoices:update"), (req, res, next) => base.update(req, res).catch(next));
router.delete("/:id", authorize("invoices:delete"), (req, res, next) => base.remove(req, res).catch(next));

/** Generate an invoice for a student from fee types (standard or custom line items). */
router.post("/generate", authorize("invoices:create"), asyncHandler(async (req, res) => {
  const { studentId, termId, academicYearId, feeTypeIds, customItems, discount = 0, tax = 0, dueInDays = 14 } =
    req.body as {
      studentId: number;
      termId?: number;
      academicYearId?: number;
      feeTypeIds?: number[];
      customItems?: Array<{ name: string; amount: number }>;
      discount?: number;
      tax?: number;
      dueInDays?: number;
    };

  const student = await Student.findByPk(studentId);
  if (!student) throw ApiError.notFound("Student not found");

  const lineItems: Array<{ name: string; amount: number }> = [];
  if (Array.isArray(feeTypeIds) && feeTypeIds.length) {
    const fees = await FeeType.findAll({ where: { id: { [Op.in]: feeTypeIds }, isActive: true } });
    for (const f of fees) lineItems.push({ name: f.name, amount: Number(f.amount) });
  }
  if (Array.isArray(customItems)) lineItems.push(...customItems);
  if (!lineItems.length) throw ApiError.badRequest("Provide feeTypeIds or customItems");

  const gross = lineItems.reduce((a, b) => a + Number(b.amount), 0);
  const totalDue = Math.round((gross - Number(discount) + Number(tax)) * 100) / 100;

  let enrolmentId: number | undefined;
  const enrolment = await Enrolment.findOne({ where: { studentId, status: "active" }, order: [["createdAt", "DESC"]] });
  if (enrolment) enrolmentId = enrolment.id;

  const invoice = await Invoice.create({
    invoiceNo: `INV-${Date.now()}`,
    studentId,
    enrolmentId,
    termId: termId ?? null,
    amount: gross,
    discount: Number(discount),
    tax: Number(tax),
    totalDue,
    dueDate: new Date(Date.now() + Number(dueInDays) * 86400000),
    issueDate: new Date(),
    status: "pending",
    lineItems,
  });

  await writeAuditLog({ action: "create", entity: "invoice", entityId: invoice.id, userId: req.user!.id, role: req.user!.role, ip: req.ip, newData: { invoiceNo: invoice.invoiceNo, totalDue } });
  ApiResponse.success(res, 201, "Invoice generated", invoice);
}));

/** Mark an invoice status (overdue, cancelled, paid). */
router.patch("/:id/status", authorize("invoices:update"), asyncHandler(async (req, res) => {
  const invoice = await Invoice.findByPk(req.params.id);
  if (!invoice) throw ApiError.notFound("Invoice not found");
  await invoice.update({ status: req.body.status });
  ApiResponse.success(res, 200, "Invoice updated", invoice);
}));

/** Record a payment against an invoice → updates balance, creates receipt. */
router.post("/:id/pay", authorize("payments:create"), asyncHandler(async (req, res) => {
  const invoice = await Invoice.findByPk(req.params.id);
  if (!invoice) throw ApiError.notFound("Invoice not found");

  const amount = Number(req.body.amount);
  if (!(amount > 0)) throw ApiError.badRequest("amount must be positive");

  const payment = await Payment.create({
    receiptNo: `PAY-${Date.now()}`,
    invoiceId: invoice.id,
    studentId: invoice.studentId,
    amount,
    method: req.body.method || "cash",
    reference: req.body.reference,
    paidOn: req.body.paidOn || new Date(),
    status: "successful",
    notes: req.body.notes,
    recordedBy: req.user!.id,
  });

  const paid = Number(invoice.amountPaid) + amount;
  const status = paid >= Number(invoice.totalDue) ? "paid" : "partial";
  await invoice.update({ amountPaid: paid, status });

  const receipt = await Receipt.create({
    receiptNo: `RCT-${Date.now()}`,
    paymentId: payment.id,
    invoiceId: invoice.id,
    amount,
    headline: `Payment received for ${invoice.invoiceNo}`,
    body: `Received ${amount} ${req.body.currency || "USD"} towards ${invoice.invoiceNo}. Balance due: ${Math.max(0, Number(invoice.totalDue) - paid)}.`,
    currency: req.body.currency || "USD",
  });

  ApiResponse.success(res, 201, "Payment recorded", { payment, receipt, balanceDue: Math.max(0, Number(invoice.totalDue) - paid) });
}));

export default router;