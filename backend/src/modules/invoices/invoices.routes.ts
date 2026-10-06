import { Router } from "express";
import { Op } from "sequelize";
import { authenticate } from "../../middlewares/authenticate";
import { authorize } from "../../middlewares/authorize";
import asyncHandler from "../../utils/asyncHandler";
import { ApiResponse } from "../../utils/ApiResponse";
import { ApiError } from "../../utils/ApiError";
import { Invoice, FeeType, Student, Enrolment, Term, Payment, Receipt, StudentGuardian, Parent, HostelAllocation } from "../../models";
import { sequelize } from "../../database/sequelize";
import { createCrudController } from "../../utils/crudFactory";
import { studentScope } from "../../utils/access";
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
  // Parents see their children's invoices, students their own. Staff are only branch-scoped.
  scopeWhere: (req) => studentScope(req, "studentId"),
});


type LineItem = { name: string; amount: number; ref?: string };

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const currentMonth = (): string => new Date().toISOString().slice(0, 7);
const monthLabel = (m: string): string =>
  new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
const hostelRef = (m: string): string => `hostel:${m}`;

/** Invoices (not cancelled) of these students that already carry the given line-item ref. */
async function invoicesWithRef(studentIds: number[], ref: string): Promise<Map<number, string>> {
  const found = new Map<number, string>();
  if (!studentIds.length) return found;
  const rows = await Invoice.findAll({
    where: { studentId: studentIds, status: { [Op.ne]: "cancelled" } },
    attributes: ["studentId", "invoiceNo", "lineItems"],
  });
  for (const inv of rows) {
    const items = Array.isArray(inv.lineItems) ? (inv.lineItems as Array<{ ref?: string }>) : [];
    if (items.some((it) => it?.ref === ref)) found.set(Number(inv.studentId), inv.invoiceNo);
  }
  return found;
}

const hostelLineName = (a: any, month: string): string =>
  `Hostel fee (${monthLabel(month)}) — ${a.hostel?.name ?? "Hostel"}, room ${a.room?.roomNo ?? "?"}, bed ${a.bed?.bedNo ?? "?"}`;

async function newInvoice(opts: {
  student: Student; lineItems: LineItem[]; discount: number; tax: number; dueInDays: number;
  termId?: number | null; callerBranch?: number | null; transaction?: any;
}): Promise<Invoice> {
  const gross = opts.lineItems.reduce((a, b) => a + Number(b.amount), 0);
  if (opts.discount > gross) throw ApiError.badRequest("discount cannot exceed gross amount");
  const totalDue = Math.round((gross - opts.discount + opts.tax) * 100) / 100;
  const enrolment = await Enrolment.findOne({ where: { studentId: opts.student.id, status: "active" }, order: [["createdAt", "DESC"]], transaction: opts.transaction });
  return Invoice.create({
    invoiceNo: `INV-${uuidv4().slice(0, 8).toUpperCase()}`,
    studentId: opts.student.id,
    enrolmentId: enrolment?.id,
    termId: opts.termId ?? null,
    branchId: opts.student.branchId ?? opts.callerBranch ?? undefined,
    amount: gross, discount: opts.discount, tax: opts.tax, totalDue,
    dueDate: new Date(Date.now() + opts.dueInDays * 86400000),
    issueDate: new Date(),
    status: "pending",
    lineItems: opts.lineItems,
  } as any, { transaction: opts.transaction });
}

// Everything the "Generate invoice" dialog needs in one call (fee types, terms, hostel bed of the student).
router.get("/generate-options", authorize("invoices:create"), asyncHandler(async (req, res) => {
  const branch = req.user!.branchId;
  const branchWhere = branch != null ? { branchId: branch } : {};
  const [feeTypes, terms] = await Promise.all([
    FeeType.findAll({ where: { isActive: true, ...branchWhere }, attributes: ["id", "name", "amount", "category"], order: [["name", "ASC"]] }),
    Term.findAll({ where: { ...branchWhere }, attributes: ["id", "name", "isCurrent", "academicYearId"], order: [["isCurrent", "DESC"], ["id", "DESC"]] }),
  ]);
  let hostel: Record<string, unknown> | null = null;
  const studentId = Number(req.query.studentId);
  if (Number.isInteger(studentId) && studentId > 0) {
    const student = await Student.findByPk(studentId, { attributes: ["id", "branchId"] });
    if (!student || (branch != null && Number(student.branchId) !== Number(branch))) throw ApiError.notFound("Student not found");
    const a: any = await HostelAllocation.findOne({ where: { studentId, status: "active" }, include: ["hostel", "room", "bed"] });
    if (a) {
      const month = currentMonth();
      const already = (await invoicesWithRef([studentId], hostelRef(month))).get(studentId) ?? null;
      hostel = { allocationId: Number(a.id), monthlyFee: Number(a.monthlyFee), label: hostelLineName(a, month), month, alreadyInvoiced: already };
    }
  }
  ApiResponse.success(res, 200, "Invoice options", { feeTypes, terms, hostel });
}));

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
  const { studentId, termId, feeTypeIds, customItems, discount = 0, tax = 0, dueInDays = 14, includeHostelFee = false, hostelMonth } =
    req.body as {
      studentId: number;
      termId?: number;
      includeHostelFee?: boolean;
      hostelMonth?: string;
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

  if (termId) {
    const term = await Term.findOne({ where: { id: termId, ...(callerBranch != null ? { branchId: callerBranch } : {}) } });
    if (!term) throw ApiError.badRequest("Selected term was not found in your branch");
  }

  const lineItems: LineItem[] = [];
  if (includeHostelFee) {
    const month = String(hostelMonth || currentMonth());
    if (!MONTH_RE.test(month)) throw ApiError.badRequest("hostelMonth must look like 2026-10");
    const alloc: any = await HostelAllocation.findOne({ where: { studentId, status: "active" }, include: ["hostel", "room", "bed"] });
    if (!alloc) throw ApiError.badRequest("This student has no active hostel bed, so there is no hostel fee to add");
    const fee = Number(alloc.monthlyFee);
    if (!(fee > 0)) throw ApiError.badRequest("The monthly hostel fee on this student's allocation is 0. Set it on the allocation first");
    const dup = (await invoicesWithRef([Number(studentId)], hostelRef(month))).get(Number(studentId));
    if (dup) throw ApiError.conflict(`The hostel fee for ${monthLabel(month)} is already on invoice ${dup}`);
    lineItems.push({ name: hostelLineName(alloc, month), amount: fee, ref: hostelRef(month) });
  }
  if (Array.isArray(feeTypeIds) && feeTypeIds.length) {
    // Scope fee types to caller's branch to prevent attaching other branches' fees.
    const feeWhere: any = { id: { [Op.in]: feeTypeIds }, isActive: true };
    if (callerBranch != null) feeWhere.branchId = callerBranch;
    const fees = await FeeType.findAll({ where: feeWhere });
    if (fees.length !== new Set(feeTypeIds.map(Number)).size) {
      throw ApiError.badRequest("One or more selected fee types are inactive or don't exist in your branch");
    }
    for (const f of fees) lineItems.push({ name: f.name, amount: Number(f.amount) });
  }
  if (Array.isArray(customItems)) {
    for (const ci of customItems) {
      const amt = Number(ci.amount);
      if (!Number.isFinite(amt) || amt < 0) throw ApiError.badRequest("custom item amount must be non-negative");
      lineItems.push({ name: String(ci.name), amount: amt });
    }
  }
  if (!lineItems.length) throw ApiError.badRequest("Choose at least one fee, the hostel fee, or add a custom item");

  const invoice = await newInvoice({ student, lineItems, discount: numDiscount, tax: numTax, dueInDays: numDueInDays, termId: termId ?? null, callerBranch });

  await writeAuditLog({ action: "create", entity: "invoice", entityId: invoice.id, userId: req.user!.id, role: req.user!.role, ip: req.ip, newData: { invoiceNo: invoice.invoiceNo, totalDue: invoice.totalDue } });
  ApiResponse.success(res, 201, "Invoice generated", invoice);
}));


/**
 * Bill the monthly hostel fee of every resident for one month. Safe to run twice: a student who
 * already has that month's hostel line on a (non-cancelled) invoice is skipped.
 */
router.post("/generate-hostel", authorize("invoices:create"), asyncHandler(async (req, res) => {
  const month = String(req.body?.month || currentMonth());
  if (!MONTH_RE.test(month)) throw ApiError.badRequest("month must look like 2026-10");
  const dueInDays = req.body?.dueInDays === undefined ? 14 : Number(req.body.dueInDays);
  if (!Number.isInteger(dueInDays) || dueInDays < 0 || dueInDays > 365) throw ApiError.badRequest("dueInDays must be an integer between 0 and 365");
  const termId = req.body?.termId ? Number(req.body.termId) : null;
  const callerBranch = req.user!.branchId;
  if (termId && !(await Term.findOne({ where: { id: termId, ...(callerBranch != null ? { branchId: callerBranch } : {}) } }))) {
    throw ApiError.badRequest("Selected term was not found in your branch");
  }

  const [y, m] = month.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 0, 23, 59, 59));
  // Anyone who had a bed at some point during that month.
  const allocs: any[] = await HostelAllocation.findAll({
    where: {
      checkIn: { [Op.lte]: end },
      [Op.or]: [{ checkOut: null }, { checkOut: { [Op.gte]: start } }],
      ...(callerBranch != null ? { branchId: callerBranch } : {}),
    },
    include: ["student", "hostel", "room", "bed"],
    order: [["checkIn", "ASC"]],
  });
  // A transferred student has two overlapping rows: bill once, using the latest bed.
  const latest = new Map<number, any>();
  for (const a of allocs) latest.set(Number(a.studentId), a);

  const ids = Array.from(latest.keys());
  const existing = await invoicesWithRef(ids, hostelRef(month));
  const created: Array<{ invoiceNo: string; student: string; amount: number }> = [];
  let skippedExisting = 0, skippedNoFee = 0, skippedInactive = 0;

  await sequelize.transaction(async (t) => {
    for (const a of latest.values()) {
      const student: Student = a.student;
      if (!student || student.isActive === false) { skippedInactive++; continue; }
      if (existing.has(Number(a.studentId))) { skippedExisting++; continue; }
      const fee = Number(a.monthlyFee);
      if (!(fee > 0)) { skippedNoFee++; continue; }
      const inv = await newInvoice({
        student, lineItems: [{ name: hostelLineName(a, month), amount: fee, ref: hostelRef(month) }],
        discount: 0, tax: 0, dueInDays, termId, callerBranch, transaction: t,
      });
      created.push({ invoiceNo: inv.invoiceNo, student: `${student.firstName} ${student.lastName}`.trim(), amount: fee });
    }
  });

  await writeAuditLog({
    action: "create", entity: "invoice", entityId: 0, userId: req.user!.id, role: req.user!.role, ip: req.ip,
    newData: { event: "hostel_month_billed", month, created: created.length, skippedExisting, skippedNoFee },
  } as any);
  ApiResponse.success(res, 201, created.length ? `${created.length} hostel invoice(s) created for ${monthLabel(month)}` : `Nothing to bill for ${monthLabel(month)}`, {
    month, created: created.length, skippedExisting, skippedNoFee, skippedInactive, total: created.reduce((a, b) => a + b.amount, 0), invoices: created.slice(0, 100),
  });
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
  const t = await Invoice.sequelize!.transaction();
  try {
    const invoice = await Invoice.findByPk(req.params.id, { transaction: t, lock: t.LOCK.UPDATE });
    if (!invoice) throw ApiError.notFound("Invoice not found");
    const callerBranch = req.user!.branchId;
    if (callerBranch != null && Number(invoice.branchId) !== Number(callerBranch)) {
      throw ApiError.forbidden("Invoice does not belong to your branch");
    }
    const oldStatus = invoice.status;
    const nextStatus = String(req.body.status || "");
    const allowed = INVOICE_TRANSITIONS[invoice.status] ?? [];
    if (!allowed.includes(nextStatus)) {
      throw ApiError.badRequest(`Cannot transition invoice from '${invoice.status}' to '${nextStatus}'`);
    }
    if (nextStatus === "cancelled" && Number(invoice.amountPaid) > 0) {
      throw ApiError.badRequest("This invoice has payments. Refund them first, then cancel the invoice.");
    }
    if (nextStatus === "paid" && Number(invoice.amountPaid) < Number(invoice.totalDue)) {
      throw ApiError.badRequest("Invoice cannot be marked paid before the full amount is received");
    }
    if (nextStatus === "partial" && Number(invoice.amountPaid) <= 0) {
      throw ApiError.badRequest("Cannot mark invoice as partial — no payment recorded");
    }
    await invoice.update({ status: nextStatus }, { transaction: t });
    await writeAuditLog({
      action: "update", entity: "invoice", entityId: invoice.id,
      userId: req.user!.id, role: req.user!.role, branchId: invoice.branchId,
      oldData: { status: oldStatus }, newData: { status: nextStatus },
    }, t);
    await t.commit();
    ApiResponse.success(res, 200, "Invoice updated", invoice);
  } catch (e) {
    await t.rollback();
    throw e;
  }
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
    if (!Number.isFinite(amount) || amount <= 0) throw ApiError.badRequest("amount must be positive");
    const paidOn = req.body.paidOn ? new Date(req.body.paidOn) : new Date();
    if (Number.isFinite(paidOn.getTime()) && paidOn.getTime() > Date.now() + 86400000) throw ApiError.badRequest("Payment date cannot be more than 1 day in the future");
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
      paidOn,
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