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

const router = Router();
router.use(authenticate);

const base = createCrudController<BookIssue>({
  model: BookIssue,
  searchable: ["status", "requestedFor"],
  defaultSort: [["issueDate", "DESC"]],
});

router.get("/", authorize("library:read"), (req, res, next) => base.list(req, res).catch(next));
router.get("/:id", authorize("library:read"), (req, res, next) => base.getOne(req, res).catch(next));
router.delete("/:id", authorize("library:delete"), (req, res, next) => base.remove(req, res).catch(next));

router.post("/", authorize("book-issues:create"), asyncHandler(async (req, res) => {
  const { bookId, bookCopyId, userId, studentId, dueInDays = 14, requestedFor = "student" } = req.body;

  // Accept either a specific copy or pick an available one for a book.
  const issue = await sequelize.transaction(async (transaction) => {
    let copy = bookCopyId
      ? await BookCopy.findByPk(bookCopyId, { transaction, lock: transaction.LOCK.UPDATE })
      : null;
    if (!copy && bookId) {
      copy = await BookCopy.findOne({ where: { bookId, status: "available" }, transaction, lock: transaction.LOCK.UPDATE });
    }
    if (!copy || copy.status !== "available") throw ApiError.badRequest("No available copy for this book");

    let borrowerId = userId;
    if (!borrowerId && studentId) {
      const student = await Student.findByPk(studentId, { transaction });
      borrowerId = student?.userId;
    }
    const borrower = borrowerId ? await User.findByPk(borrowerId, { transaction }) : null;
    if (!borrower) throw ApiError.badRequest("Borrower not found: provide a valid userId or studentId");

    const days = Number(dueInDays);
    if (!Number.isInteger(days) || days < 1 || days > 365) throw ApiError.badRequest("dueInDays must be between 1 and 365");

    await copy.update({ status: "issued" }, { transaction });
    return BookIssue.create({
      bookCopyId: copy.id, userId: borrowerId, issueDate: new Date(),
      dueDate: new Date(Date.now() + days * 86400000), requestedFor, status: "issued", fine: 0,
    }, { transaction });
  });
  ApiResponse.success(res, 201, "Book issued", issue);
}));

router.put("/:id", authorize("book-issues:update"), asyncHandler(async (req, res) => {
  const issue = await BookIssue.findByPk(req.params.id);
  if (!issue) throw ApiError.notFound("Issue not found");
  const { dueDate, status, requestedFor } = req.body;
  if (status !== undefined && status !== issue.status) throw ApiError.badRequest("Use the return or mark-lost action to change status");
  if (dueDate !== undefined && Number.isNaN(new Date(dueDate).getTime())) throw ApiError.badRequest("Invalid dueDate");
  await issue.update({
    ...(dueDate !== undefined ? { dueDate } : {}),
    ...(requestedFor !== undefined ? { requestedFor } : {}),
  });
  ApiResponse.success(res, 200, "Book issue updated", issue);
}));

router.post("/:id/return", authorize("book-issues:update"), asyncHandler(async (req, res) => {
  const issue = await sequelize.transaction(async (transaction) => {
    const current = await BookIssue.findByPk(req.params.id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!current) throw ApiError.notFound("Issue not found");
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
      await BookFine.create({ bookIssueId: current.id, userId: current.userId, amount: lateDays * perDay, reason: `${lateDays} day(s) late`, status: "pending" }, { transaction });
    }
    return current;
  });
  ApiResponse.success(res, 200, "Book returned", issue);
}));

router.post("/:id/mark-lost", authorize("book-issues:update"), asyncHandler(async (req, res) => {
  const issue = await sequelize.transaction(async (transaction) => {
    const current = await BookIssue.findByPk(req.params.id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!current) throw ApiError.notFound("Issue not found");
    if (current.status !== "issued") throw ApiError.badRequest("Only issued books can be marked lost");
    const copy = await BookCopy.findByPk(current.bookCopyId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!copy || copy.status !== "issued") throw ApiError.badRequest("Book copy is not currently issued");
    const lostFine = Number(req.body.lostFine ?? 10);
    if (!Number.isFinite(lostFine) || lostFine < 0) throw ApiError.badRequest("lostFine must be non-negative");
    const book = await Book.findByPk(copy.bookId, { transaction });
    const fine = lostFine + (book ? Number(book.price || 0) : 0);
    await current.update({ status: "lost", returnDate: new Date() }, { transaction });
    await copy.update({ status: "lost" }, { transaction });
    await BookFine.create({ bookIssueId: current.id, userId: current.userId, amount: fine, reason: "Book lost", status: "pending" }, { transaction });
    return current;
  });
  ApiResponse.success(res, 200, "Book marked lost", issue);
}));

router.get("/overdue/list", authorize("library:read"), asyncHandler(async (_req, res) => {
  const issues = await BookIssue.findAll({
    where: { status: "issued", dueDate: { [Op.lt]: new Date() } },
    include: [{ association: "borrower", attributes: ["id", "firstName", "lastName", "email"] }],
    order: [["dueDate", "ASC"]],
  });
  ApiResponse.success(res, 200, "Overdue books", issues);
}));

export default router;