import { Router } from "express";
import { Op } from "sequelize";
import { sequelize } from "../../database/sequelize";
import { authenticate } from "../../middlewares/authenticate";
import { authorize } from "../../middlewares/authorize";
import asyncHandler from "../../utils/asyncHandler";
import { ApiResponse } from "../../utils/ApiResponse";
import { ApiError } from "../../utils/ApiError";
import { BookCopy, Book, BookIssue, BookFine, User, Student } from "../../models";
import { createCrudController } from "../../utils/crudFactory";
import { writeAuditLog } from "../../services/audit.service";

const router = Router();
const branchOf = (req: any) => req.user?.branchId == null ? null : Number(req.user.branchId);
const assertBranch = (row: any, req: any, label: string) => { const b = branchOf(req); if (b != null && (!row || Number(row.branchId) !== b)) throw ApiError.forbidden(`${label} does not belong to your branch`); };
router.use(authenticate);

const base = createCrudController<BookIssue>({
  model: BookIssue,
  searchable: ["status", "requestedFor"],
  defaultSort: [["issueDate", "DESC"]],
  includes: [
    { association: "borrower", attributes: ["id", "firstName", "lastName", "email"] },
    { association: "bookCopy", attributes: ["id", "accessionNo", "status"], include: [{ association: "book", attributes: ["id", "title", "isbn"] }] },
  ],
  decorate: (row: any) => {
    const p = row && typeof row.get === "function" ? row.get({ plain: true }) : { ...row };
    p.borrowerName = p.borrower ? `${p.borrower.firstName} ${p.borrower.lastName}`.trim() : "";
    p.accessionNo = p.bookCopy?.accessionNo ?? "";
    p.bookTitle = p.bookCopy?.book?.title ?? "";
    p.isOverdue = p.status === "issued" && p.dueDate && new Date(p.dueDate) < new Date();
    return p;
  },
});

router.get("/", authorize("library:read"), (req, res, next) => base.list(req, res).catch(next));
// IMPORTANT: /overdue/list MUST come before /:id, otherwise Express matches "overdue" as an id param
// and the route becomes unreachable (returns 400 "Invalid id").
router.get("/overdue/list", authorize("library:read"), asyncHandler(async (req, res) => {
  const issues = await BookIssue.findAll({
    where: { status: "issued", dueDate: { [Op.lt]: new Date() }, ...(branchOf(req) != null ? { branchId: branchOf(req) } : {}) },
    include: [{ association: "borrower", attributes: ["id", "firstName", "lastName", "email"] }],
    order: [["dueDate", "ASC"]],
  });
  ApiResponse.success(res, 200, "Overdue books", issues);
}));
router.get("/:id", authorize("library:read"), (req, res, next) => base.getOne(req, res).catch(next));
// DELETE on book-issues is intentionally disabled — issues have linked BookFine records (financial history).
// router.delete("/:id", authorize("library:delete"), (req, res, next) => base.remove(req, res).catch(next));

router.post("/", authorize("book-issues:create"), asyncHandler(async (req, res) => {
  const { bookId, bookCopyId, userId, studentId, dueInDays = 14, requestedFor = "student" } = req.body;

  // Validate requestedFor against an enum.
  const ALLOWED_BORROWER_TYPES = new Set(["student", "teacher", "staff"]);
  if (!ALLOWED_BORROWER_TYPES.has(String(requestedFor))) {
    throw ApiError.badRequest(`requestedFor must be one of: ${[...ALLOWED_BORROWER_TYPES].join(", ")}`);
  }

  // Accept either a specific copy or pick an available one for a book.
  const issue = await sequelize.transaction(async (transaction) => {
    let copy = bookCopyId
      ? await BookCopy.findByPk(bookCopyId, { transaction, lock: transaction.LOCK.UPDATE })
      : null;
    if (!copy && bookId) {
      // Scope the available-copy lookup by branch so we don't pick a copy from another branch.
      const branchScope = branchOf(req) != null ? { branchId: branchOf(req) } : {};
      copy = await BookCopy.findOne({ where: { bookId, status: "available", ...branchScope }, transaction, lock: transaction.LOCK.UPDATE });
    }
    if (!copy || copy.status !== "available") throw ApiError.badRequest("No available copy for this book");
    assertBranch(copy, req, "Book copy");

    let borrowerId = userId;
    if (!borrowerId && studentId) {
      const student = await Student.findByPk(studentId, { transaction });
      borrowerId = student?.userId;
    }
    const borrower = borrowerId ? await User.findByPk(borrowerId, { transaction }) : null;
    assertBranch(borrower, req, "Borrower");
    if (!borrower) throw ApiError.badRequest("Borrower not found: provide a valid userId or studentId");

    const days = Number(dueInDays);
    if (!Number.isInteger(days) || days < 1 || days > 365) throw ApiError.badRequest("dueInDays must be between 1 and 365");

    await copy.update({ status: "issued" }, { transaction });
    const created = await BookIssue.create({
      bookCopyId: copy.id, userId: borrowerId, branchId: branchOf(req), issueDate: new Date(),
      dueDate: new Date(Date.now() + days * 86400000), requestedFor, status: "issued", fine: 0,
    }, { transaction });
    return created;
  });
  await writeAuditLog({
    action: "create",
    entity: "book_issue",
    entityId: issue.id,
    userId: req.user!.id,
    role: req.user!.role,
    branchId: issue.branchId,
    ip: req.ip,
    newData: { bookCopyId: issue.bookCopyId, userId: issue.userId, requestedFor: issue.requestedFor },
  });
  ApiResponse.success(res, 201, "Book issued", issue);
}));

router.put("/:id", authorize("book-issues:update"), asyncHandler(async (req, res) => {
  const issue = await BookIssue.findByPk(req.params.id);
  if (!issue) throw ApiError.notFound("Issue not found");
  assertBranch(issue, req, "Book issue");
  // Block edits to returned / lost issues — they have computed late fines that would become
  // incorrect if the dueDate were retroactively changed.
  if (issue.status !== "issued") {
    throw ApiError.badRequest(`Cannot edit a ${issue.status} book issue (use a separate lifecycle action)`);
  }
  const { dueDate, status, requestedFor } = req.body;
  if (status !== undefined && status !== issue.status) throw ApiError.badRequest("Use the return or mark-lost action to change status");
  if (dueDate !== undefined && Number.isNaN(new Date(dueDate).getTime())) throw ApiError.badRequest("Invalid dueDate");
  await issue.update({
    ...(dueDate !== undefined ? { dueDate } : {}),
    ...(requestedFor !== undefined ? { requestedFor } : {}),
  });
  await writeAuditLog({
    action: "update",
    entity: "book_issue",
    entityId: issue.id,
    userId: req.user!.id,
    role: req.user!.role,
    branchId: issue.branchId,
    ip: req.ip,
    newData: { dueDate, requestedFor },
  });
  ApiResponse.success(res, 200, "Book issue updated", issue);
}));

router.post("/:id/return", authorize("book-issues:update"), asyncHandler(async (req, res) => {
  const issue = await sequelize.transaction(async (transaction) => {
    const current = await BookIssue.findByPk(req.params.id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!current) throw ApiError.notFound("Issue not found");
    assertBranch(current, req, "Book issue");
    if (current.status !== "issued") throw ApiError.badRequest("Only issued books can be returned");
    const copy = await BookCopy.findByPk(current.bookCopyId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!copy || copy.status !== "issued") throw ApiError.badRequest("Book copy is not currently issued");

    const returnedAt = new Date();
    const perDay = Number(req.body.perDayFine ?? 1);
    if (!Number.isFinite(perDay) || perDay < 0) throw ApiError.badRequest("perDayFine must be non-negative");
    const lateDays = Math.max(0, Math.ceil((returnedAt.getTime() - new Date(current.dueDate).getTime()) / 86400000));

    await current.update({ returnDate: returnedAt, status: "returned" }, { transaction });
    await copy.update({ status: "available" }, { transaction });
    if (lateDays > 0) {
      // Set branchId on the BookFine so branch users can see the fine in their list (was missing — fines were invisible).
      await BookFine.create({ bookIssueId: current.id, userId: current.userId, amount: lateDays * perDay, reason: `${lateDays} day(s) late`, status: "pending", branchId: current.branchId ?? branchOf(req) ?? undefined }, { transaction });
    }
    return current;
  });
  await writeAuditLog({
    action: "update",
    entity: "book_issue",
    entityId: issue.id,
    userId: req.user!.id,
    role: req.user!.role,
    branchId: issue.branchId,
    ip: req.ip,
    newData: { status: "returned" },
  });
  ApiResponse.success(res, 200, "Book returned", issue);
}));

router.post("/:id/mark-lost", authorize("book-issues:update"), asyncHandler(async (req, res) => {
  const issue = await sequelize.transaction(async (transaction) => {
    const current = await BookIssue.findByPk(req.params.id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!current) throw ApiError.notFound("Issue not found");
    // Branch-scope guard (was missing — closed a cross-tenant IDOR where a branch-A user could
    // mark a branch-B book issue as lost by ID).
    assertBranch(current, req, "Book issue");
    if (current.status !== "issued") throw ApiError.badRequest("Only issued books can be marked lost");
    const copy = await BookCopy.findByPk(current.bookCopyId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!copy || copy.status !== "issued") throw ApiError.badRequest("Book copy is not currently issued");
    const lostFine = Number(req.body.lostFine ?? 10);
    if (!Number.isFinite(lostFine) || lostFine < 0) throw ApiError.badRequest("lostFine must be non-negative");
    const book = await Book.findByPk(copy.bookId, { transaction });
    const fine = lostFine + (book ? Number(book.price || 0) : 0);
    await current.update({ status: "lost", returnDate: new Date() }, { transaction });
    await copy.update({ status: "lost" }, { transaction });
    // Set branchId on the BookFine so branch users can see the fine in their list.
    await BookFine.create({ bookIssueId: current.id, userId: current.userId, amount: fine, reason: "Book lost", status: "pending", branchId: current.branchId ?? branchOf(req) ?? undefined }, { transaction });
    return current;
  });
  await writeAuditLog({
    action: "update",
    entity: "book_issue",
    entityId: issue.id,
    userId: req.user!.id,
    role: req.user!.role,
    branchId: issue.branchId,
    ip: req.ip,
    newData: { status: "lost" },
  });
  ApiResponse.success(res, 200, "Book marked lost", issue);
}));

export default router;