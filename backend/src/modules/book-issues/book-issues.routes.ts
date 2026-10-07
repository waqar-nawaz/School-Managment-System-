import { Router } from "express";
import { Op } from "sequelize";
import { likeOp } from "../../utils/search";
import { sequelize } from "../../database/sequelize";
import { authenticate } from "../../middlewares/authenticate";
import { authorize } from "../../middlewares/authorize";
import asyncHandler from "../../utils/asyncHandler";
import { ApiResponse } from "../../utils/ApiResponse";
import { ApiError } from "../../utils/ApiError";
import { BookCopy, Book, BookIssue, BookFine, User, Student } from "../../models";
import { createCrudController } from "../../utils/crudFactory";
import { ownStudentIds } from "../../utils/access";
import { writeAuditLog } from "../../services/audit.service";
import { parsePagination, buildPaginationMeta } from "../../utils/pagination";

const router = Router();
// A book stays "open" from issue until it is returned or lost. The nightly job flips late ones to
// "overdue"; those must still be returnable / markable as lost / editable.
const OPEN_STATUSES = ["issued", "overdue"];
// Roles that only ever see (and act on) their own loans.
const OWN_ONLY_ROLES = new Set(["student", "teacher", "staff", "parent"]);
const branchOf = (req: any) => req.user?.branchId == null ? null : Number(req.user.branchId);
const assertBranch = (row: any, req: any, label: string) => { const b = branchOf(req); if (b != null && (!row || Number(row.branchId) !== b)) throw ApiError.forbidden(`${label} does not belong to your branch`); };
router.use(authenticate);

const base = createCrudController<BookIssue>({
  model: BookIssue,
  searchable: ["status", "requestedFor"],
  toSearchWhere: (q: string) => ({
    [Op.or]: [
      { status: { [likeOp]: `%${q}%` } },
      { requestedFor: { [likeOp]: `%${q}%` } },
      { "$bookCopy.accessionNo$": { [likeOp]: `%${q}%` } },
      { "$bookCopy.book.title$": { [likeOp]: `%${q}%` } },
      { "$borrower.firstName$": { [likeOp]: `%${q}%` } },
      { "$borrower.lastName$": { [likeOp]: `%${q}%` } },
      { "$borrower.email$": { [likeOp]: `%${q}%` } },
    ],
  }),
  defaultSort: [["issueDate", "DESC"]],
  scopeWhere: async (req: any) => {
    const role = req.user?.role;
    if (!OWN_ONLY_ROLES.has(role)) return {};
    if (role === "parent") {
      // Parents see loans of their linked children.
      const ids = (await ownStudentIds(req)) ?? [];
      const { Student } = await import("../../models");
      const kids = ids.length ? await Student.findAll({ where: { id: ids }, attributes: ["userId"] }) : [];
      return { userId: kids.map((k) => k.userId).filter(Boolean) };
    }
    return { userId: req.user.id };
  },
  includes: [
    { association: "borrower", attributes: ["id", "firstName", "lastName", "email"] },
    { association: "bookCopy", attributes: ["id", "accessionNo", "status"], include: [{ association: "book", attributes: ["id", "title", "isbn"] }] },
  ],
  decorate: (row: any) => {
    const p = row && typeof row.get === "function" ? row.get({ plain: true }) : { ...row };
    p.borrowerName = p.borrower ? `${p.borrower.firstName} ${p.borrower.lastName}`.trim() : "";
    p.accessionNo = p.bookCopy?.accessionNo ?? "";
    p.bookTitle = p.bookCopy?.book?.title ?? "";
    p.isOverdue = OPEN_STATUSES.includes(p.status) && p.dueDate && new Date(p.dueDate) < new Date();
    // Keep the UI accurate even when the optional production cron has not run yet.
    if (p.status === "issued" && p.isOverdue) p.status = "overdue";
    return p;
  },
});

router.get("/", authorize("library:read", "book-issues:read"), (req, res, next) => base.list(req, res).catch(next));
// IMPORTANT: /overdue/list MUST come before /:id, otherwise Express matches "overdue" as an id param
// and the route becomes unreachable (returns 400 "Invalid id").
router.get("/overdue/list", authorize("book-issues:update", "library:update"), asyncHandler(async (req, res) => {
  const p = parsePagination(req);
  const q = req.query.q ? String(req.query.q).trim() : "";
  const where: any = {
    status: OPEN_STATUSES,
    dueDate: { [Op.lt]: new Date() },
    ...(branchOf(req) != null ? { branchId: branchOf(req) } : {}),
  };
  if (q) {
    where[Op.or] = [
      { "$bookCopy.accessionNo$": { [likeOp]: `%${q}%` } },
      { "$bookCopy.book.title$": { [likeOp]: `%${q}%` } },
      { "$borrower.firstName$": { [likeOp]: `%${q}%` } },
      { "$borrower.lastName$": { [likeOp]: `%${q}%` } },
      { "$borrower.email$": { [likeOp]: `%${q}%` } },
    ];
  }
  const { count, rows } = await BookIssue.findAndCountAll({
    where,
    limit: p.limit,
    offset: p.offset,
    order: [["dueDate", "ASC"]],
    distinct: true,
    include: [
      { association: "borrower", attributes: ["id", "firstName", "lastName", "email"] },
      { association: "bookCopy", attributes: ["id", "accessionNo"], include: [{ association: "book", attributes: ["id", "title", "isbn"] }] },
    ],
  });
  const meta = buildPaginationMeta(p.page, p.limit, count);
  const data = rows.map((row: any) => {
    const plain = row.get({ plain: true });
    plain.borrowerName = plain.borrower ? `${plain.borrower.firstName} ${plain.borrower.lastName}`.trim() : "";
    plain.accessionNo = plain.bookCopy?.accessionNo ?? "";
    plain.bookTitle = plain.bookCopy?.book?.title ?? "";
    plain.isOverdue = true;
    plain.status = "overdue";
    return plain;
  });
  ApiResponse.success(res, 200, "Overdue books", data, meta);
}));
router.get("/:id", authorize("library:read", "book-issues:read"), (req, res, next) => base.getOne(req, res).catch(next));
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
    if (copy && bookId && Number(copy.bookId) !== Number(bookId)) {
      throw ApiError.badRequest("Selected book does not match the selected copy");
    }
    if (!copy && bookId) {
      // Scope the available-copy lookup by branch so we don't pick a copy from another branch.
      const branchScope = branchOf(req) != null ? { branchId: branchOf(req) } : {};
      copy = await BookCopy.findOne({ where: { bookId, status: "available", ...branchScope }, transaction, lock: transaction.LOCK.UPDATE });
    }
    if (!copy || copy.status !== "available") throw ApiError.badRequest("No available copy for this book");
    assertBranch(copy, req, "Book copy");

    const book = await Book.findByPk(copy.bookId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!book || (branchOf(req) != null && Number(book.branchId) !== branchOf(req))) {
      throw ApiError.badRequest("Book does not belong to your branch");
    }
    if (!book.isActive) throw ApiError.badRequest("This book is inactive and cannot be issued");

    let borrowerId = userId;
    // Portal users can only ever borrow for themselves.
    if (OWN_ONLY_ROLES.has(req.user!.role)) borrowerId = req.user!.id;
    else if (!borrowerId && studentId) {
      const student = await Student.findByPk(studentId, { transaction });
      if (!student || (branchOf(req) != null && Number(student.branchId) !== branchOf(req))) {
        throw ApiError.badRequest("Student does not belong to your branch");
      }
      borrowerId = student.userId;
    }
    const borrower = borrowerId ? await User.findByPk(borrowerId, { transaction }) : null;
    assertBranch(borrower, req, "Borrower");
    if (!borrower) throw ApiError.badRequest("Borrower not found: provide a valid userId or studentId");
    if (!borrower.isActive) throw ApiError.badRequest("Borrower account is inactive");

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
  if (!OPEN_STATUSES.includes(issue.status)) {
    throw ApiError.badRequest(`Cannot edit a ${issue.status} book issue (use a separate lifecycle action)`);
  }
  const { dueDate, status, requestedFor } = req.body;
  if (status !== undefined && status !== issue.status) throw ApiError.badRequest("Use the return or mark-lost action to change status");
  if (requestedFor !== undefined && !["student", "teacher", "staff"].includes(String(requestedFor))) {
    throw ApiError.badRequest("requestedFor must be one of: student, teacher, staff");
  }
  if (dueDate !== undefined) {
    const parsedDueDate = new Date(dueDate);
    if (Number.isNaN(parsedDueDate.getTime())) throw ApiError.badRequest("Invalid dueDate");
    if (parsedDueDate.getTime() <= new Date(issue.issueDate).getTime()) {
      throw ApiError.badRequest("dueDate must be after issueDate");
    }
  }
  await issue.update({
    ...(dueDate !== undefined ? { dueDate } : {}),
    ...(requestedFor !== undefined ? { requestedFor } : {}),
    // Extending the due date of a late book puts it back to a normal loan.
    ...(dueDate !== undefined && issue.status === "overdue" && new Date(dueDate) > new Date() ? { status: "issued" } : {}),
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
    if (!OPEN_STATUSES.includes(current.status)) throw ApiError.badRequest("Only issued books can be returned");
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
    if (!OPEN_STATUSES.includes(current.status)) throw ApiError.badRequest("Only issued books can be marked lost");
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