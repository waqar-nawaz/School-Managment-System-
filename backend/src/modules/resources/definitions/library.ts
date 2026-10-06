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
  const accessionNo = String(body.accessionNo ?? existing?.accessionNo ?? "");

  if (!Number.isInteger(bookId) || bookId <= 0 || !accessionNo) {
    throw ApiError.badRequest("Book and accession number are required");
  }

  const book = await Book.findByPk(bookId);
  if (!book || (branchId != null && Number(book.branchId) !== Number(branchId))) {
    throw ApiError.badRequest("Book does not belong to your branch");
  }
  if (existing && branchId != null && Number(existing.branchId) !== Number(branchId)) {
    throw ApiError.forbidden("Book copy does not belong to your branch");
  }

  const duplicate = await BookCopy.findOne({
    where: {
      accessionNo,
      ...(branchId != null ? { branchId } : {}),
      ...(existing?.id ? { id: { [Op.ne]: existing.id } } : {}),
    },
  });
  if (duplicate) throw ApiError.badRequest("Accession number already exists in this branch");

  if (!existing) {
    body.status = "available";
  } else if (body.status !== undefined && String(body.status) !== String(existing.status)) {
    const from = String(existing.status);
    const to = String(body.status);
    const allowed = (from === "available" && to === "damaged") || (from === "damaged" && to === "available");
    if (!allowed) {
      throw ApiError.badRequest("Use the issue, return, or lost workflow to change a copy's circulation status");
    }
  }

  body.bookId = bookId;
  body.accessionNo = accessionNo;
  body.branchId = branchId;
  return body;
};

const validateBookFine = async (body: any, req: Request) => {
  const existing = await getExisting(BookFine, req);
  const branchId = req.user?.branchId;
  const issueId = Number(body.bookIssueId ?? existing?.bookIssueId);
  const userId = Number(body.userId ?? existing?.userId);
  const amount = Number(body.amount ?? existing?.amount);
  const status = String(body.status ?? existing?.status ?? "pending");

  const issue = await BookIssue.findByPk(issueId);
  if (!issue || (branchId != null && Number(issue.branchId) !== Number(branchId))) {
    throw ApiError.badRequest("Book issue does not belong to your branch");
  }

  const user = await User.findByPk(userId);
  if (!user || !user.isActive || (branchId != null && Number(user.branchId) !== Number(branchId))) {
    throw ApiError.badRequest("Borrower does not belong to your branch or is inactive");
  }

  if (!Number.isFinite(amount) || amount < 0) {
    throw ApiError.badRequest("Fine amount must be non-negative");
  }
  if (!["pending", "paid", "waived"].includes(status)) {
    throw ApiError.badRequest("Invalid fine status");
  }

  if (!existing) {
    if (status !== "pending") throw ApiError.badRequest("A new fine must start as pending");
    if (!["returned", "lost"].includes(String(issue.status))) {
      throw ApiError.badRequest("A fine can only be created for a returned or lost book issue");
    }
    const duplicateFine = await BookFine.findOne({ where: { bookIssueId: issueId } });
    if (duplicateFine) throw ApiError.badRequest("A fine already exists for this book issue");
  } else {
    if (Number(existing.bookIssueId) !== issueId || Number(existing.userId) !== userId) {
      throw ApiError.badRequest("Book issue and borrower cannot be changed after a fine is created");
    }

    const current = String(existing.status);
    if (current !== "pending" && status !== current) {
      throw ApiError.badRequest("A " + current + " fine cannot be changed");
    }

    if (status === "paid") {
      body.paidAt = existing.paidAt ?? new Date();
      body.receiptNo = String(existing.receiptNo ?? "").trim() || ("LIB-" + Date.now() + "-" + existing.id);
    } else if (status === "waived") {
      body.paidAt = null;
      body.receiptNo = null;
      const reason = String(body.reason ?? existing.reason ?? "").trim();
      if (!reason) throw ApiError.badRequest("A waiver reason is required");
      body.reason = reason;
    } else {
      body.paidAt = null;
      body.receiptNo = null;
    }
  }

  body.bookIssueId = issueId;
  body.userId = userId;
  body.amount = amount;
  body.status = status;
  body.branchId = branchId;
  return body;
};

const preventBookDelete = async (req: Request) => {
  const id = Number(req.params.id);
  const copies = await BookCopy.count({ where: { bookId: id } });
  if (copies > 0) throw ApiError.badRequest("Cannot delete a book that has physical copies; deactivate it instead");
};

const preventBookCopyDelete = async (req: Request) => {
  const id = Number(req.params.id);
  const copy = await BookCopy.findByPk(id);
  if (!copy) throw ApiError.notFound("Book copy not found");
  if (["issued", "lost", "reserved"].includes(String(copy.status))) {
    throw ApiError.badRequest("This copy cannot be deleted while it is part of the circulation lifecycle");
  }
  const history = await BookIssue.count({ where: { bookCopyId: id } });
  if (history > 0) throw ApiError.badRequest("Cannot delete a copy with circulation history; keep it as damaged or lost");
};

export const LIBRARY_RESOURCES: ResourceDefinition[] = [
  {
    path: "books",
    model: Book,
    searchable: ["title", "author", "isbn", "category"],
    permission: "library",
    beforeCreate: validateBook,
    beforeUpdate: validateBook,
    beforeRemove: preventBookDelete,
  },
  {
    path: "book-copies",
    model: BookCopy,
    searchable: ["accessionNo", "status"],
    permission: "library",
    beforeCreate: validateBookCopy,
    beforeUpdate: validateBookCopy,
    beforeRemove: preventBookCopyDelete,
    includes: [{ association: "book", attributes: ["id", "title", "isbn"] }],
    decorate: (row: any) => {
      const p = row && typeof row.get === "function" ? row.get({ plain: true }) : { ...row };
      p.bookTitle = p.book?.title ?? "";
      return p;
    },
  },
  {
    path: "book-fines",
    model: BookFine,
    searchable: ["receiptNo", "status", "reason"],
    permission: "book-fines",
    beforeCreate: validateBookFine,
    beforeUpdate: validateBookFine,
    includes: [
      {
        association: "bookIssue",
        attributes: ["id", "status", "bookCopyId"],
        include: [{ association: "bookCopy", attributes: ["id", "accessionNo"], include: [{ association: "book", attributes: ["id", "title", "isbn"] }] }],
      },
      { association: "user", attributes: ["id", "firstName", "lastName", "email"] },
    ],
    decorate: (row: any) => {
      const p = row && typeof row.get === "function" ? row.get({ plain: true }) : { ...row };
      p.bookTitle = p.bookIssue?.bookCopy?.book?.title ?? "";
      p.accessionNo = p.bookIssue?.bookCopy?.accessionNo ?? "";
      p.borrowerName = p.user ? `${p.user.firstName} ${p.user.lastName}`.trim() : "";
      return p;
    },
  },
];
