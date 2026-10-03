/** Shared types and helpers for the resource definition files. */
import { Request } from "express";
import { ApiError } from "../../../utils/ApiError";
import { Op, WhereOptions } from "sequelize";
import {
  Student,
  Certificate,
  Book,
  Complaint,
  User,
} from "../../../models";

export interface ResourceDefinition {
  path: string;
  model: any;
  searchable: string[];
  permission: string; // module name used for :read/:create/:update/:delete
  defaultSort?: [string, "ASC" | "DESC"];
  scopeWhere?: (req: Request) => WhereOptions | Promise<WhereOptions>;
  /** Columns to hide for this request. */
  hideAttributes?: (req: Request) => string[];
  /** Columns that must never be exposed (also excluded from CSV export). */
  sensitiveColumns?: string[];
  readonly?: boolean; // no write operations exposed
  afterCreate?: (row: any, req: Request) => void | Promise<void>;
  afterUpdate?: (row: any, req: Request) => void | Promise<void>;
  afterRemove?: (row: any, req: Request) => void | Promise<void>;
  beforeCreate?: (body: any, req: Request) => Record<string, unknown> | Promise<Record<string, unknown>>;
  beforeUpdate?: (body: any, req: Request) => Record<string, unknown> | Promise<Record<string, unknown>>;
  beforeRemove?: (req: Request) => void | Promise<void>;
  includes?: any[];
  decorate?: (row: any) => Record<string, unknown>;
}

/** Row → plain object (works for Sequelize instances and plain rows). */
export const plain = (row: any): Record<string, any> =>
  row && typeof row.get === "function" ? row.get({ plain: true }) : { ...row };

export const getExisting = async (model: any, req: Request) => {
  const id = req.params?.id;
  return id ? model.findByPk(id) : null;
};

export const validateCertificate = async (body: any, req: Request) => {
  const existing = await getExisting(Certificate, req);
  const studentId = Number(body.studentId ?? existing?.studentId);
  const certNo = String(body.certNo ?? existing?.certNo ?? "").trim();
  const type = String(body.type ?? existing?.type ?? "");
  const issuedOn = body.issuedOn !== undefined ? new Date(body.issuedOn) : (existing?.issuedOn ? new Date(existing.issuedOn) : new Date());
  const branchId = req.user?.branchId;
  if (!certNo || !Number.isInteger(studentId) || studentId <= 0) throw ApiError.badRequest("certNo and studentId are required");
  if (!["transfer", "character", "bonafide", "provisional", "mark_sheet"].includes(type)) throw ApiError.badRequest("Invalid certificate type");
  if (!Number.isFinite(issuedOn.getTime())) throw ApiError.badRequest("Invalid issuedOn date");
  const student = await Student.findByPk(studentId);
  if (!student || (branchId != null && Number(student.branchId) !== Number(branchId))) throw ApiError.badRequest("Student does not belong to your branch");
  const duplicate = await Certificate.findOne({ where: { certNo, ...(existing?.id ? { id: { [Op.ne]: existing.id } } : {}) } });
  if (duplicate) throw ApiError.badRequest("Certificate number already exists");
  body.studentId = studentId; body.certNo = certNo; body.type = type; body.issuedOn = issuedOn; body.branchId = branchId;
  return body;
};

export const validateComplaint = async (body: any, req: Request) => {
  const existing = await getExisting(Complaint, req);
  const title = String(body.title ?? existing?.title ?? "").trim();
  const description = String(body.description ?? existing?.description ?? "").trim();
  const category = String(body.category ?? existing?.category ?? "");
  const status = String(body.status ?? existing?.status ?? "open");
  const priority = String(body.priority ?? existing?.priority ?? "low");
  const branchId = req.user?.branchId;
  if (!title || !description) throw ApiError.badRequest("Complaint title and description are required");
  if (!["grievance", "harassment", "infrastructure", "other"].includes(category)) throw ApiError.badRequest("Invalid complaint category");
  if (!["open", "in_progress", "resolved", "closed", "rejected"].includes(status)) throw ApiError.badRequest("Invalid complaint status");
  if (!["low", "medium", "high", "urgent"].includes(priority)) throw ApiError.badRequest("Invalid complaint priority");
  const assignedTo = body.assignedTo ?? existing?.assignedTo;
  if (assignedTo != null) {
    const user = await User.findByPk(Number(assignedTo));
    if (!user || !user.isActive || (branchId != null && Number(user.branchId) !== Number(branchId))) throw ApiError.badRequest("Assigned user does not belong to your branch");
    body.assignedTo = Number(assignedTo);
  }
  body.title = title; body.description = description; body.category = category; body.status = status; body.priority = priority; body.branchId = branchId;
  if (status === "resolved" || status === "closed") body.resolvedAt = body.resolvedAt ? new Date(body.resolvedAt) : (existing?.resolvedAt ?? new Date());
  return body;
};

export const validateBook = async (body: any, req: Request) => {
  const existing = await getExisting(Book, req);
  const branchId = req.user?.branchId;
  const isbn = String(body.isbn ?? existing?.isbn ?? "").trim();
  const title = String(body.title ?? existing?.title ?? "").trim();
  const copies = Number(body.copies ?? existing?.copies ?? 1);
  const price = Number(body.price ?? existing?.price ?? 0);
  if (!isbn || !title) throw ApiError.badRequest("ISBN and title are required");
  if (!Number.isInteger(copies) || copies < 0) throw ApiError.badRequest("copies must be a non-negative integer");
  if (!Number.isFinite(price) || price < 0) throw ApiError.badRequest("price must be non-negative");
  const duplicate = await Book.findOne({ where: { isbn, ...(branchId != null ? { branchId } : {}), ...(existing?.id ? { id: { [Op.ne]: existing.id } } : {}) } });
  if (duplicate) throw ApiError.badRequest("ISBN already exists in this branch");
  body.isbn = isbn; body.title = title; body.copies = copies; body.price = price; body.branchId = branchId;
  return body;
};
