/** People profiles (parents, teachers, staff) */
import { Request } from "express";
import { ApiError } from "../../../utils/ApiError";
import { Op } from "sequelize";
import {
  Parent,
  Teacher,
  Staff,
  User,
} from "../../../models";
import { ResourceDefinition, getExisting } from "./shared";

const validateStaffProfile = async (body: any, req: Request, model: any, label: string) => {
  const existing = await getExisting(model, req);
  const branchId = Number(req.user?.branchId);
  const EMPLOYEE_ROLES = new Set(["teacher", "staff", "hostel_warden", "accountant", "librarian", "transport_manager", "receptionist", "principal"]);
  if (!Number.isInteger(branchId) || branchId <= 0) throw ApiError.badRequest("User is not assigned to a branch");
  const userId = Number(body.userId ?? existing?.userId);
  if (!Number.isInteger(userId) || userId <= 0) throw ApiError.badRequest("userId is required");
  const user = await User.findByPk(userId);
  if (!user || !user.isActive) throw ApiError.badRequest(`Selected ${label} user is not active`);
  // Allow any employee role to be linked to a Staff profile (not just "staff").
  if (!EMPLOYEE_ROLES.has(String(user.role))) throw ApiError.badRequest(`Selected user must have an employee role (teacher, staff, hostel_warden, accountant, librarian, transport_manager, receptionist, or principal)`);
  if (Number(user.branchId) !== branchId) throw ApiError.badRequest(`Selected ${label} user does not belong to your branch`);
  // A teacher/staff login gets its profile automatically when the user is created, so a second
  // profile for the same login is always a mistake (it broke lookups by userId).
  const already = await model.findOne({ where: { userId, ...(existing?.id ? { id: { [Op.ne]: existing.id } } : {}) } });
  if (already) throw ApiError.conflict(`This user already has a ${label} profile (#${already.id}). Edit that profile instead of creating another.`);
  const staffNo = String(body.staffNo ?? existing?.staffNo ?? "").trim();
  if (!staffNo) throw ApiError.badRequest("staffNo is required");
  const duplicate = await model.findOne({ where: { staffNo, ...(branchId != null ? { branchId } : {}), ...(existing?.id ? { id: { [Op.ne]: existing.id } } : {}) } });
  if (duplicate) throw ApiError.badRequest(`${label} staffNo already exists in this branch`);
  body.userId = userId;
  body.staffNo = staffNo;
  body.branchId = branchId;
  if (body.isActive === undefined) body.isActive = existing?.isActive ?? true;
  return body;
};

const validateParentProfile = async (body: any, req: Request) => {
  const existing = await getExisting(Parent, req);
  const branchId = Number(req.user?.branchId);
  if (!Number.isInteger(branchId) || branchId <= 0) throw ApiError.badRequest("User is not assigned to a branch");
  const userId = Number(body.userId ?? existing?.userId);
  if (!Number.isInteger(userId) || userId <= 0) throw ApiError.badRequest("userId is required");
  const user = await User.findByPk(userId);
  if (!user || !user.isActive) throw ApiError.badRequest("Selected parent user is not active");
  if (String(user.role) !== "parent") throw ApiError.badRequest("Selected user must have the parent role");
  if (Number(user.branchId) !== branchId) throw ApiError.badRequest("Selected parent user does not belong to your branch");
  const fullName = String(body.fullName ?? existing?.fullName ?? "").trim();
  if (!fullName) throw ApiError.badRequest("Parent fullName is required");
  body.userId = userId;
  body.fullName = fullName;
  body.branchId = branchId;
  return body;
};

export const PEOPLE_RESOURCES: ResourceDefinition[] = [
  { path: "parents", model: Parent, searchable: ["fullName", "phone", "email"], permission: "students", beforeCreate: validateParentProfile, beforeUpdate: validateParentProfile },
  { path: "teachers", model: Teacher, searchable: ["staffNo", "firstName", "lastName", "email"], permission: "teachers", beforeCreate: (body, req) => validateStaffProfile(body, req, Teacher, "teacher"), beforeUpdate: (body, req) => validateStaffProfile(body, req, Teacher, "teacher") },
  { path: "staff", model: Staff, searchable: ["staffNo", "firstName", "lastName", "department"], permission: "staff", beforeCreate: (body, req) => validateStaffProfile(body, req, Staff, "staff"), beforeUpdate: (body, req) => validateStaffProfile(body, req, Staff, "staff") },
];
