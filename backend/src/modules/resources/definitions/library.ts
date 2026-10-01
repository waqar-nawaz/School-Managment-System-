/** Library catalogue and fines (issue/return lives in book-issues module) */
import { Request } from "express";
import { ApiError } from "../../../utils/ApiError";
import { Op } from "sequelize";
import {
  Book,
  BookCopy,
  BookFine,
  User,
  BookIssue,
} from "../../../models";
import { ResourceDefinition, getExisting, validateBook } from "./shared";

const validateBookCopy = async (body: any, req: Request) => {
  const existing = await getExisting(BookCopy, req);
  const branchId = req.user?.branchId;
  const bookId = Number(body.bookId ?? existing?.bookId);
  const accessionNo = String(body.accessionNo ?? existing?.accessionNo ?? "").trim();
  if (!Number.isInteger(bookId) || bookId <= 0 || !accessionNo) throw ApiError.badRequest("bookId and accessionNo are required");
  const book = await Book.findByPk(bookId);
  if (!book || (branchId != null && Number(book.branchId) !== Number(branchId))) throw ApiError.badRequest("Book does not belong to your branch");
  const duplicate = await BookCopy.findOne({ where: { accessionNo, ...(branchId != null ? { branchId } : {}), ...(existing?.id ? { id: { [Op.ne]: existing.id } } : {}) } });
  if (duplicate) throw ApiError.badRequest("Accession number already exists in this branch");
  if (body.status !== undefined && !["available","issued","reserved","damaged","lost"].includes(String(body.status))) throw ApiError.badRequest("Invalid copy status");
  body.bookId = bookId; body.accessionNo = accessionNo; body.branchId = branchId;
  if (existing) delete body.status;
  return body;
};

const validateBookFine = async (body: any, req: Request) => {
  const existing = await getExisting(BookFine, req);
  const branchId = req.user?.branchId;
  const issueId = Number(body.bookIssueId ?? existing?.bookIssueId);
  const userId = Number(body.userId ?? existing?.userId);
  const amount = Number(body.amount ?? existing?.amount);
  const issue = await BookIssue.findByPk(issueId);
  if (!issue || (branchId != null && Number(issue.branchId) !== Number(branchId))) throw ApiError.badRequest("Book issue does not belong to your branch");
  if (!Number.isInteger(userId) || userId <= 0) throw ApiError.badRequest("userId is required");
  const user = await User.findByPk(userId);
  if (!user || (branchId != null && Number(user.branchId) !== Number(branchId))) throw ApiError.badRequest("User does not belong to your branch");
  if (!Number.isFinite(amount) || amount < 0) throw ApiError.badRequest("Fine amount must be non-negative");
  body.bookIssueId = issueId; body.userId = userId; body.amount = amount; body.branchId = branchId;
  return body;
};

export const LIBRARY_RESOURCES: ResourceDefinition[] = [
  { path: "books", model: Book, searchable: ["title", "author", "isbn", "category"], permission: "library", beforeCreate: validateBook, beforeUpdate: validateBook },
  { path: "book-copies", model: BookCopy, searchable: ["accessionNo", "status"], permission: "library", beforeCreate: validateBookCopy, beforeUpdate: validateBookCopy },
  { path: "book-fines", model: BookFine, searchable: ["receiptNo", "status"], permission: "book-fines", beforeCreate: validateBookFine, beforeUpdate: validateBookFine },
];
