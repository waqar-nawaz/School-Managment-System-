/** Health, discipline, complaints, inventory, assets, audit logs and visitors */
import { Request } from "express";
import { ApiError } from "../../../utils/ApiError";
import { Op } from "sequelize";
import {
  Student,
  HealthRecord,
  DisciplineRecord,
  Complaint,
  InventoryItem,
  Asset,
  AuditLog,
  VisitorLog,
} from "../../../models";
import { ResourceDefinition, plain, getExisting, validateComplaint } from "./shared";

const validateInventory = async (body: any, req: Request) => {
  const existing = await getExisting(InventoryItem, req);
  const name = String(body.name ?? existing?.name ?? "").trim();
  if (!name) throw ApiError.badRequest("Inventory item name is required");

  const quantity = Number(body.quantity ?? existing?.quantity ?? 0);
  const minQuantity = Number(body.minQuantity ?? existing?.minQuantity ?? 0);
  const unitPrice = Number(body.unitPrice ?? existing?.unitPrice ?? 0);
  if (!Number.isInteger(quantity) || quantity < 0) throw ApiError.badRequest("quantity must be a non-negative integer");
  if (!Number.isInteger(minQuantity) || minQuantity < 0) throw ApiError.badRequest("minQuantity must be a non-negative integer");
  if (!Number.isFinite(unitPrice) || unitPrice < 0) throw ApiError.badRequest("unitPrice must be a non-negative number");

  const sku = String(body.sku ?? existing?.sku ?? "").trim();
  const branchId = req.user?.branchId;
  if (sku) {
    const duplicate = await InventoryItem.findOne({
      where: {
        sku,
        ...(branchId != null ? { branchId } : {}),
        ...(existing?.id ? { id: { [Op.ne]: existing.id } } : {}),
      },
    });
    if (duplicate) throw ApiError.badRequest("Inventory SKU already exists");
    body.sku = sku;
  }
  body.name = name;
  body.quantity = quantity;
  body.minQuantity = minQuantity;
  body.unitPrice = unitPrice;
  return body;
};

const validateAsset = async (body: any, req: Request) => {
  const existing = await getExisting(Asset, req);
  const assetCode = String(body.assetCode ?? existing?.assetCode ?? "").trim();
  const name = String(body.name ?? existing?.name ?? "").trim();
  if (!assetCode || !name) throw ApiError.badRequest("assetCode and name are required");

  const branchId = req.user?.branchId;
  const duplicate = await Asset.findOne({
    where: {
      assetCode,
      ...(branchId != null ? { branchId } : {}),
      ...(existing?.id ? { id: { [Op.ne]: existing.id } } : {}),
    },
  });
  if (duplicate) throw ApiError.badRequest("Asset code already exists");

  if (body.purchaseDate !== undefined || existing?.purchaseDate) {
    const date = body.purchaseDate !== undefined ? new Date(body.purchaseDate) : new Date(existing.purchaseDate);
    if (!Number.isFinite(date.getTime())) throw ApiError.badRequest("Invalid purchaseDate");
    body.purchaseDate = date;
  }
  if (body.purchasePrice !== undefined || existing?.purchasePrice !== undefined) {
    const price = Number(body.purchasePrice ?? existing?.purchasePrice ?? 0);
    if (!Number.isFinite(price) || price < 0) throw ApiError.badRequest("purchasePrice must be a non-negative number");
    body.purchasePrice = price;
  }
  const allowed = ["in_use", "stored", "maintenance", "scrapped"];
  const status = String(body.status ?? existing?.status ?? "in_use");
  if (!allowed.includes(status)) throw ApiError.badRequest("Invalid asset status");
  body.assetCode = assetCode;
  body.name = name;
  body.status = status;
  return body;
};

const validateDiscipline = async (body: any, req: Request) => {
  const existing = await getExisting(DisciplineRecord, req);
  const studentId = Number(body.studentId ?? existing?.studentId);
  const type = String(body.type ?? existing?.type ?? "").trim();
  const recordedOn = body.recordedOn !== undefined ? new Date(body.recordedOn) : new Date(existing?.recordedOn ?? Date.now());
  if (!Number.isInteger(studentId) || studentId <= 0) throw ApiError.badRequest("Valid studentId is required");
  if (!type) throw ApiError.badRequest("type is required");
  if (!["warning", "detention", "suspension", "praise"].includes(type)) {
    throw ApiError.badRequest("Invalid discipline record type");
  }
  if (!Number.isFinite(recordedOn.getTime())) throw ApiError.badRequest("Invalid recordedOn date");

  const student = await Student.findByPk(studentId);
  if (!student) throw ApiError.badRequest("Student not found");
  if (req.user?.branchId != null && Number(student.branchId) !== Number(req.user.branchId)) {
    throw ApiError.badRequest("Student does not belong to your branch");
  }

  body.studentId = studentId;
  body.type = type;
  body.recordedOn = recordedOn;
  if (req.user?.id != null) body.recordedBy = req.user.id;
  return body;
};

const validateHealthRecord = async (body: any, req: Request) => {
  const existing = await getExisting(HealthRecord, req);
  const studentId = Number(body.studentId ?? existing?.studentId);
  const branchId = req.user?.branchId;
  if (!Number.isInteger(studentId) || studentId <= 0) throw ApiError.badRequest("studentId is required");
  const student = await Student.findByPk(studentId);
  if (!student || (branchId != null && Number(student.branchId) !== Number(branchId))) throw ApiError.badRequest("Student does not belong to your branch");
  body.studentId = studentId; body.branchId = branchId;
  if (body.lastCheckup !== undefined && body.lastCheckup) {
    const d = new Date(body.lastCheckup); if (!Number.isFinite(d.getTime())) throw ApiError.badRequest("Invalid lastCheckup date"); body.lastCheckup = d;
  }
  return body;
};

export const OPERATIONS_RESOURCES: ResourceDefinition[] = [
  { path: "health-records", model: HealthRecord, searchable: ["bloodGroup"], permission: "health-records", beforeCreate: validateHealthRecord, beforeUpdate: validateHealthRecord },
  {
    path: "discipline-records", model: DisciplineRecord, searchable: ["title", "type", "status"], permission: "discipline-records",
    beforeCreate: validateDiscipline,
    beforeUpdate: (body, req) => validateDiscipline(body, req),
  },
  {
    path: "complaints", model: Complaint, searchable: ["title", "category", "status"], permission: "complaints",
    // Complaints can be sensitive (harassment etc.): families/staff only see what they filed.
    scopeWhere: (req) => ["super_admin", "admin", "principal"].includes(String(req.user?.role ?? "")) ? {} : { submittedBy: req.user?.id },
    beforeCreate: async (body, req) => {
      const checked = await validateComplaint(body, req);
      checked.submittedBy = req.user?.id;
      return checked;
    },
    beforeUpdate: async (body, req) => {
      const checked = await validateComplaint(body, req);
      delete checked.submittedBy;
      return checked;
    },
  },
  {
    path: "inventory", model: InventoryItem, searchable: ["name", "sku", "category"], permission: "inventory",
    beforeCreate: validateInventory,
    beforeUpdate: validateInventory,
  },
  {
    path: "assets", model: Asset, searchable: ["name", "assetCode", "category"], permission: "inventory",
    beforeCreate: validateAsset,
    beforeUpdate: validateAsset,
  },
  {
    path: "audit-logs", model: AuditLog, searchable: ["action", "entity"], permission: "audit-logs", readonly: true,
    // Expose the acting user's name alongside the userId so the audit UI can render
    // 'Waqar Nawaz' instead of an opaque id. The association is declared in models/index.ts.
    includes: [{ association: "user", attributes: ["id", "firstName", "lastName", "username", "role"] }],
    allowedFilters: ["action", "entity", "userId"],
    decorate: (row) => {
      const p = plain(row);
      const u = (p as any).user;
      p.userName = u
        ? `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || `#${p.userId}`
        : (p.userId ? `#${p.userId}` : "—");
      p.userRoleLabel = u?.role ?? p.role ?? "";
      // The nested user object isn't useful to the client — keep the payload flat.
      delete (p as any).user;
      return p;
    },
  },
  {
    path: "visitor-logs", model: VisitorLog, searchable: ["visitorName", "purpose"], permission: "visitors",
    beforeCreate: (body, req) => {
      const checkedIn = body.checkedIn ? new Date(body.checkedIn) : new Date();
      if (!Number.isFinite(checkedIn.getTime())) throw ApiError.badRequest("Invalid checkedIn date");
      const checkedOut = body.checkedOut ? new Date(body.checkedOut) : null;
      if (checkedOut && (!Number.isFinite(checkedOut.getTime()) || checkedOut < checkedIn)) {
        throw ApiError.badRequest("checkedOut must be after checkedIn");
      }
      body.checkedIn = checkedIn;
      body.checkedOut = checkedOut;
      body.registeredBy = req.user?.id;
      return body;
    },
    beforeUpdate: async (body, req) => {
      const current = await VisitorLog.findByPk(req.params.id);
      if (!current) throw ApiError.badRequest("Visitor log not found");
      const checkedIn = body.checkedIn !== undefined ? new Date(body.checkedIn) : new Date(current.checkedIn);
      const checkedOut = body.checkedOut !== undefined ? (body.checkedOut ? new Date(body.checkedOut) : null) : (current.checkedOut ? new Date(current.checkedOut) : null);
      if (!Number.isFinite(checkedIn.getTime()) || (checkedOut && (!Number.isFinite(checkedOut.getTime()) || checkedOut < checkedIn))) {
        throw ApiError.badRequest("Invalid visitor check-in/check-out time");
      }
      body.checkedIn = checkedIn;
      body.checkedOut = checkedOut;
      delete body.registeredBy;
      return body;
    },
  },
];
