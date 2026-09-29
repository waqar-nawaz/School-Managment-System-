import { Router } from "express";
import { Op } from "sequelize";
import { authenticate } from "../../middlewares/authenticate";
import { authorize } from "../../middlewares/authorize";
import asyncHandler from "../../utils/asyncHandler";
import { ApiResponse } from "../../utils/ApiResponse";
import { ApiError } from "../../utils/ApiError";
import { Invoice, FeeType, Student, Enrolment, Term, Payment, Receipt, StudentGuardian, Parent } from "../../models";
import { createCrudController } from "../../utils/crudFactory";
import { writeAuditLog } from "../../services/audit.service";
import { v4 as uuidv4 } from "uuid";

const router = Router();
router.use(authenticate);

const base = createCrudController<Invoice>({
  model: Invoice,
  searchable: ["invoiceNo", "status"],
  defaultSort: [["issueDate", "DESC"]],
  includes: [{ association: "payments" }, { association: "student" }],
  allowedFilters: ["status", "studentId", "termId", "branchId", "issueDate", "dueDate"],
});

router.get("/", authorize("invoices:read"), (req, res, next) => base.list(req, res).catch(next));
router.get("/:id", authorize("invoices:read"), (req, res, next) => base.getOne(req, res).catch(next));
// PUT freezes financial fields once the invoice has any payment (amountPaid > 0) or is cancelled.
// Allows editing only of metadata fields like notes/dueDate (not amounts, status, lineItems).
router.put("/:id", authorize("invoices:update"), asyncHandler(async (req, res, next) => {
  const callerBranch = req.user!.branchId;
  const invoice = await Invoice.findByPk(req.params.id);
  if (!invoice) throw ApiError.notFound("Invoice not found");
  if (callerBranch != null && Number(invoice.branchId) !== Number(callerBranch)) {
    throw ApiError.forbidden("Invoice does not belong to your branch");
  }
  const frozen = Number(invoice.amountPaid) > 0 || invoice.status === "cancelled" || invoice.status === "paid";
  const FROZEN_FIELDS = new Set(["amount", "lineItems", "totalDue", "amountPaid", "status", "invoiceNo", "studentId", "branchId", "discount", "tax"]);
  const body = { ...req.body };
  // Status transitions must always go through PATCH /:id/status (state machine), never PUT.
  // Amount/discount/tax are immutable after generation — void and re-generate if a price is wrong.
  // Only metadata (notes, dueDate, termId) is editable via PUT.
  const ALLOWED_METADATA = new Set(["notes", "dueDate", "termId"]);
  if (frozen) {
    for (const k of Object.keys(body)) {
      if (FROZEN_FIELDS.has(k) || !ALLOWED_METADATA.has(k)) delete body[k];
    }
  } else {
    // Even before payment, only metadata fields are editable.
    for (const k of Object.keys(body)) {
      if (!ALLOWED_METADATA.has(k)) delete body[k];
    }
  }
  if (Object.keys(body).length === 0) {
    throw ApiError.badRequest("Invoice is locked — use PATCH /:id/status for status changes or void+re-generate for amount changes");
  }
  await invoice.update(body);
  await writeAuditLog({
    action: "update",
    entity: "invoice",
    entityId: invoice.id,
    userId: req.user!.id,
    role: req.user!.role,
    branchId: invoice.branchId,
    newData: body,
  });
  ApiResponse.success(res, 200, "Invoice updated", invoice);
}));
// Note: DELETE on financial records is intentionally disabled.
// Use PATCH /:id/status with status='cancelled' to void an invoice.
// router.delete("/:id", authorize("invoices:delete"), (req, res, next) => base.remove(req, res).catch(next));

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

  // Validate discount/tax are non-negative.
  const numDiscount = Number(discount);
  const numTax = Number(tax);
  if (!Number.isFinite(numDiscount) || numDiscount < 0) throw ApiError.badRequest("discount must be non-negative");
  if (!Number.isFinite(numTax) || numTax < 0) throw ApiError.badRequest("tax must be non-negative");
  // Validate dueInDays is a non-negative integer ≤ 365.
  const numDueInDays = Number(dueInDays);
  if (!Number.isInteger(numDueInDays) || numDueInDays < 0 || numDueInDays > 365) {
    throw ApiError.badRequest("dueInDays must be an integer between 0 and 365");
  }

  const student = await Student.findByPk(studentId);
  if (!student) throw ApiError.notFound("Student not found");
  // Cross-tenant guard: caller may only invoice students in their own branch.
  const callerBranch = req.user!.branchId;
  if (callerBranch != null && Number(student.branchId) !== Number(callerBranch)) {
    throw ApiError.forbidden("Student does not belong to your branch");
  }

  const lineItems: Array<{ name: string; amount: number }> = [];
  if (Array.isArray(feeTypeIds) && feeTypeIds.length) {
    // Scope fee types to caller's branch to prevent attaching other branches' fees.
    const feeWhere: any = { id: { [Op.in]: feeTypeIds }, isActive: true };
    if (callerBranch != null) feeWhere.branchId = callerBranch;
    const fees = await FeeType.findAll({ where: feeWhere });
    for (const f of fees) lineItems.push({ name: f.name, amount: Number(f.amount) });
  }
  if (Array.isArray(customItems)) {
    for (const ci of customItems) {
      const amt = Number(ci.amount);
      if (!Number.isFinite(amt) || amt < 0) throw ApiError.badRequest("custom item amount must be non-negative");
      lineItems.push({ name: String(ci.name), amount: amt });
    }
  }
  if (!lineItems.length) throw ApiError.badRequest("Provide feeTypeIds or customItems");

  const gross = lineItems.reduce((a, b) => a + Number(b.amount), 0);
  if (numDiscount > gross) throw ApiError.badRequest("discount cannot exceed gross amount");
  const totalDue = Math.round((gross - numDiscount + numTax) * 100) / 100;

  let enrolmentId: number | undefined;
  const enrolment = await Enrolment.findOne({ where: { studentId, status: "active" }, order: [["createdAt", "DESC"]] });
  if (enrolment) enrolmentId = enrolment.id;

  const invoice = await Invoice.create({
    invoiceNo: `INV-${uuidv4().slice(0, 8).toUpperCase()}`,
    studentId,
    enrolmentId,
    termId: termId ?? null,
    branchId: student.branchId ?? callerBranch ?? undefined,
    amount: gross,
    discount: numDiscount,
    tax: numTax,
    totalDue,
    dueDate: new Date(Date.now() + numDueInDays * 86400000),
    issueDate: new Date(),
    status: "pending",
    lineItems,
  });

  await writeAuditLog({ action: "create", entity: "invoice", entityId: invoice.id, userId: req.user!.id, role: req.user!.role, ip: req.ip, newData: { invoiceNo: invoice.invoiceNo, totalDue } });
  ApiResponse.success(res, 201, "Invoice generated", invoice);
}));

/** Mark an invoice status (overdue, cancelled, paid). Enforces a state machine. */
const INVOICE_TRANSITIONS: Record<string, string[]> = {
  pending: ["partial", "overdue", "cancelled"],
  partial: ["paid", "overdue", "cancelled"],
  paid: ["cancelled"],            // paid -> only voidable; cannot move back to pending/partial/overdue
  overdue: ["paid", "partial", "cancelled"],
  cancelled: [],                  // terminal — cannot be reopened
};
router.patch("/:id/status", authorize("invoices:update"), asyncHandler(async (req, res) => {
  const invoice = await Invoice.findByPk(req.params.id);
  if (!invoice) throw ApiError.notFound("Invoice not found");
  // Cross-tenant guard.
  const callerBranch = req.user!.branchId;
  if (callerBranch != null && Number(invoice.branchId) !== Number(callerBranch)) {
    throw ApiError.forbidden("Invoice does not belong to your branch");
  }
  const oldStatus = invoice.status;  // capture BEFORE update
  const nextStatus = String(req.body.status || "");
  const allowed = INVOICE_TRANSITIONS[invoice.status] ?? [];
  if (!allowed.includes(nextStatus)) {
    throw ApiError.badRequest(`Cannot transition invoice from '${invoice.status}' to '${nextStatus}'`);
  }
  if (nextStatus === "paid" && Number(invoice.amountPaid) < Number(invoice.totalDue)) {
    throw ApiError.badRequest("Invoice cannot be marked paid before the full amount is received");
  }
  await invoice.update({ status: nextStatus });
  await writeAuditLog({
    action: "update",
    entity: "invoice",
    entityId: invoice.id,
    userId: req.user!.id,
    role: req.user!.role,
    branchId: invoice.branchId,
    oldData: { status: oldStatus },
    newData: { status: nextStatus },
  });
  ApiResponse.success(res, 200, "Invoice updated", invoice);
}));

/** Record a payment against an invoice → updates balance, creates receipt. */
router.post("/:id/pay", authorize("payments:create"), asyncHandler(async (req, res) => {
  const callerBranch = req.user!.branchId;
  const callerRole = req.user!.role;

  // Re-fetch the invoice INSIDE the transaction with a row lock to close the
  // race condition where two concurrent payments both read the same amountPaid.
  const t = await Invoice.sequelize!.transaction();
  try {
    const invoice = await Invoice.findByPk(req.params.id, { transaction: t, lock: t.LOCK.UPDATE });
    if (!invoice) throw ApiError.notFound("Invoice not found");
    if (callerBranch != null && Number(invoice.branchId) !== Number(callerBranch)) {
      throw ApiError.forbidden("Invoice does not belong to your branch");
    }
    // Parent role: must be linked to the invoice's student via Parent → StudentGuardian.
    // Previous bug used the wrong column name (`guardianId` which doesn't exist on
    // `student_guardians`) and the wrong value (`req.user.id` instead of `parent.id`).
    // The result was that every parent payment returned 403.
    if (callerRole === "parent") {
      const parent = await Parent.findOne({ where: { userId: req.user!.id }, transaction: t });
      if (!parent) throw ApiError.forbidden("Parent profile not found");
      const link = await StudentGuardian.findOne({
        where: { parentId: parent.id, studentId: invoice.studentId },
        transaction: t,
      });
      if (!link) throw ApiError.forbidden("You can only pay invoices for your own children");
    }

    const amount = Number(req.body.amount);
    if (!(amount > 0)) throw ApiError.badRequest("amount must be positive");
    if (invoice.status === "cancelled") throw ApiError.badRequest("Cancelled invoices cannot receive payments");
    const remaining = Math.max(0, Number(invoice.totalDue) - Number(invoice.amountPaid));
    if (amount > remaining) throw ApiError.badRequest(`Payment exceeds remaining balance of ${remaining}`);

    // Validate payment method against the documented enum + common aliases the frontend sends.
    const ALLOWED_METHODS = new Set(["cash", "card", "bank", "mobile", "online", "bank_transfer", "cheque"]);
    const method = String(req.body.method || "cash").toLowerCase();
    if (!ALLOWED_METHODS.has(method)) throw ApiError.badRequest(`Invalid payment method: ${method}`);

    const payment = await Payment.create({
      receiptNo: `PAY-${uuidv4().slice(0, 8).toUpperCase()}`,
      invoiceId: invoice.id,
      studentId: invoice.studentId,
      branchId: invoice.branchId,
      amount,
      method,
      reference: req.body.reference,
      paidOn: req.body.paidOn || new Date(),
      status: "successful",
      notes: req.body.notes,
      recordedBy: req.user!.id,
    }, { transaction: t });

    const paid = Number(invoice.amountPaid) + amount;
    const status = paid >= Number(invoice.totalDue) ? "paid" : "partial";
    await invoice.update({ amountPaid: paid, status }, { transaction: t });

    const receipt = await Receipt.create({
      receiptNo: `RCT-${uuidv4().slice(0, 8).toUpperCase()}`,
      paymentId: payment.id,
      invoiceId: invoice.id,
      branchId: invoice.branchId,
      amount,
      headline: `Payment received for ${invoice.invoiceNo}`,
      body: `Received ${amount} ${req.body.currency || "PKR"} towards ${invoice.invoiceNo}. Balance due: ${Math.max(0, Number(invoice.totalDue) - paid)}.`,
      currency: req.body.currency || "PKR",
    }, { transaction: t });

    await writeAuditLog({
      action: "create",
      entity: "payment",
      entityId: payment.id,
      userId: req.user!.id,
      role: req.user!.role,
      branchId: invoice.branchId,
      ip: req.ip,
      newData: { invoiceId: invoice.id, amount, method },
    });

    await t.commit();
    ApiResponse.success(res, 201, "Payment recorded", { payment, receipt, balanceDue: Math.max(0, Number(invoice.totalDue) - paid) });
  } catch (e) {
    await t.rollback();
    throw e;
  }
}));

export default router;