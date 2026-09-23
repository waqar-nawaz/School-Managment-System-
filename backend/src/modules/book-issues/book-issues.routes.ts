import { Router } from "express";
import { Op } from "sequelize";
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
  let copy = bookCopyId ? await BookCopy.findByPk(bookCopyId) : null;
  if (!copy && bookId) copy = await BookCopy.findOne({ where: { bookId, status: "available" } });
  if (!copy) throw ApiError.badRequest("No available copy for this book");
  if (copy.status !== "available") throw ApiError.badRequest("This copy is not available");

  // Borrower can be a user id directly, or a student id (resolve to its user).
  let borrowerId = userId;
  if (!borrowerId && studentId) {
    const student = await Student.findByPk(studentId);
    borrowerId = student?.userId;
  }
  const borrower = borrowerId ? await User.findByPk(borrowerId) : null;
  if (!borrower) throw ApiError.badRequest("Borrower not found: provide a valid userId or studentId");

  await copy.update({ status: "issued" });
  const issue = await BookIssue.create({
    bookCopyId: copy.id,
    userId: borrowerId,
    issueDate: new Date(),
    dueDate: new Date(Date.now() + Number(dueInDays) * 86400000),
    requestedFor,
    status: "issued",
    fine: 0,
  });

  ApiResponse.success(res, 201, "Book issued", issue);
}));

router.put("/:id", authorize("book-issues:update"), asyncHandler(async (req, res) => {
  const issue = await BookIssue.findByPk(req.params.id);
  if (!issue) throw ApiError.notFound("Issue not found");
  const { dueDate, status, requestedFor } = req.body;
  await issue.update({
    ...(dueDate !== undefined ? { dueDate } : {}),
    ...(status !== undefined ? { status } : {}),
    ...(requestedFor !== undefined ? { requestedFor } : {}),
  });
  ApiResponse.success(res, 200, "Book issue updated", issue);
}));

router.post("/:id/return", authorize("book-issues:update"), asyncHandler(async (req, res) => {
  const issue = await BookIssue.findByPk(req.params.id);
  if (!issue) throw ApiError.notFound("Issue not found");
  if (["returned", "lost"].includes(issue.status)) throw ApiError.badRequest("Already returned/lost");

  await issue.update({ returnDate: new Date(), status: "returned" });
  await BookCopy.update({ status: "available" }, { where: { id: issue.bookCopyId } });

  // Auto-calc fine for late returns (per-day configurable).
  const perDay = Number(req.body.perDayFine || 1);
  const today = new Date();
  const due = new Date(issue.dueDate);
  const lateDays = Math.max(0, Math.ceil((today.getTime() - due.getTime()) / 86400000));
  if (lateDays > 0) {
    await BookFine.create({
      bookIssueId: issue.id,
      userId: issue.userId,
      amount: lateDays * perDay,
      reason: `${lateDays} day(s) late`,
      status: "pending",
    });
  }

  ApiResponse.success(res, 200, "Book returned", issue);
}));

router.post("/:id/mark-lost", authorize("book-issues:update"), asyncHandler(async (req, res) => {
  const issue = await BookIssue.findByPk(req.params.id);
  if (!issue) throw ApiError.notFound("Issue not found");
  await issue.update({ status: "lost" });
  await BookCopy.update({ status: "lost" }, { where: { id: issue.bookCopyId } });
  const book = await Book.findByPk((await BookCopy.findByPk(issue.bookCopyId))?.bookId);
  const fine = Number(req.body.lostFine || 10) + (book ? Number(book.price || 0) : 0);
  await BookFine.create({ bookIssueId: issue.id, userId: issue.userId, amount: fine, reason: "Book lost", status: "pending" });
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