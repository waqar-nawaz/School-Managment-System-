/** People profiles (parents, teachers, staff) */
import { Request } from "express";
import { ApiError } from "../../../utils/ApiError";
import { Op } from "sequelize";
import {
  Parent,
  Teacher,
  Staff,
  User,
  PayrollItem,
} from "../../../models";
import { ResourceDefinition, getExisting } from "./shared";
import { EMPLOYEE_ROLES, syncUserFromProfile, roleLabel } from "../../employees/employees.service";
import { cleanPhone, cleanEmail } from "../../students/students.service";

/**
 * Teacher and Staff profiles belong to a login (User) and are normally created automatically with it.
 *  - Teacher profile: the login must have the "teacher" role.
 *  - Staff profile: any employee role. Its employeeType always follows the login's role (never typed in).
 *  - Name/phone/email are mirrored to the login (see afterUpdate), and "active" follows the login.
 */
const validateStaffProfile = async (body: any, req: Request, model: any, label: string) => {
  const existing = await getExisting(model, req);
  const branchId = Number(req.user?.branchId);
  if (!Number.isInteger(branchId) || branchId <= 0) throw ApiError.badRequest("User is not assigned to a branch");

  const userId = Number(existing?.userId ?? body.userId);
  if (!Number.isInteger(userId) || userId <= 0) throw ApiError.badRequest("Choose the login this profile belongs to");
  if (existing && body.userId !== undefined && Number(body.userId) !== Number(existing.userId)) {
    throw ApiError.badRequest("A profile cannot be moved to another login");
  }
  const user = await User.findByPk(userId);
  if (!user || (!existing && !user.isActive)) throw ApiError.badRequest(`Selected ${label} login is not active`);
  if (label === "teacher" ? user.role !== "teacher" : !EMPLOYEE_ROLES.has(String(user.role))) {
    throw ApiError.badRequest(label === "teacher" ? "A teacher profile needs a login with the teacher role" : "Selected login must have an employee role (teacher, staff, accountant, librarian, hostel warden, transport manager, receptionist or principal)");
  }
  if (Number(user.branchId) !== branchId) throw ApiError.badRequest(`Selected ${label} login does not belong to your branch`);

  const already = await model.findOne({ where: { userId, ...(existing?.id ? { id: { [Op.ne]: existing.id } } : {}) } });
  if (already) throw ApiError.conflict(`This login already has a ${label} profile (#${already.id}). Edit that profile instead of creating another.`);

  const staffNo = String(body.staffNo ?? existing?.staffNo ?? "").trim();
  if (!staffNo) throw ApiError.badRequest("Staff number is required");
  if (staffNo.length > 30) throw ApiError.badRequest("Staff number is too long (max 30)");
  const duplicate = await model.findOne({ where: { staffNo, branchId, ...(existing?.id ? { id: { [Op.ne]: existing.id } } : {}) } });
  if (duplicate) throw ApiError.conflict(`Staff number ${staffNo} is already used in this branch`);

  if (body.firstName !== undefined && !String(body.firstName).trim()) throw ApiError.badRequest("First name cannot be empty");
  if (body.phone !== undefined) body.phone = cleanPhone(body.phone, "Phone");
  if (body.email !== undefined) {
    body.email = cleanEmail(body.email);
    if (body.email) {
      const clash = await User.findOne({ where: { email: body.email, id: { [Op.ne]: userId } } });
      if (clash) throw ApiError.conflict(`The email ${body.email} belongs to another login`);
    }
  }
  if (body.hireDate !== undefined && body.hireDate !== null && body.hireDate !== "" && !Number.isFinite(new Date(body.hireDate).getTime())) {
    throw ApiError.badRequest("Hire date is not a valid date");
  }
  if (body.hireDate === "") body.hireDate = null;
  if (body.basicSalary !== undefined && body.basicSalary !== "") {
    const sal = Number(body.basicSalary);
    if (!Number.isFinite(sal) || sal < 0) throw ApiError.badRequest("Basic salary must be zero or more");
    body.basicSalary = sal;
  } else if (body.basicSalary === "") delete body.basicSalary;

  // These are owned by the login, not typed on the profile.
  body.employeeType = user.role;
  if (existing) delete body.isActive; // deactivate the login (Users) to retire an employee
  else body.isActive = true;
  body.userId = userId;
  body.staffNo = staffNo;
  body.branchId = branchId;
  return body;
};

/** An employee with a live login or pay history is deactivated, never deleted. */
const guardProfileRemoval = (model: any, label: string) => async (req: Request) => {
  const row = await model.findByPk(Number(req.params.id));
  if (!row || (req.user?.branchId != null && Number(row.branchId) !== Number(req.user.branchId))) throw ApiError.notFound(`${label} profile not found`);
  const user = row.userId ? await User.findByPk(row.userId) : null;
  if (user?.isActive) throw ApiError.badRequest(`${row.firstName} still has an active login. Deactivate the login in Users instead of deleting the profile.`);
  const paid = await PayrollItem.count({ where: model === Staff ? { staffId: row.id } : { teacherId: row.id } });
  if (paid > 0) throw ApiError.badRequest("This employee has payroll history and cannot be deleted.");
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
  {
    path: "teachers", model: Teacher, searchable: ["staffNo", "firstName", "lastName", "email"], permission: "teachers",
    includes: [{ association: "user", attributes: ["id", "username", "role", "isActive"] }],
    beforeCreate: (body, req) => validateStaffProfile(body, req, Teacher, "teacher"),
    beforeUpdate: (body, req) => validateStaffProfile(body, req, Teacher, "teacher"),
    afterUpdate: async (row) => { await syncUserFromProfile(row); },
    beforeRemove: guardProfileRemoval(Teacher, "Teacher"),
    decorate: (row) => { const p = typeof row.toJSON === "function" ? row.toJSON() : { ...row }; p.username = p.user?.username ?? ""; p.loginActive = p.user?.isActive ?? false; return p; },
  },
  {
    path: "staff", model: Staff, searchable: ["staffNo", "firstName", "lastName", "department", "designation"], permission: "staff",
    includes: [{ association: "user", attributes: ["id", "username", "role", "isActive"] }],
    beforeCreate: (body, req) => validateStaffProfile(body, req, Staff, "staff"),
    beforeUpdate: (body, req) => validateStaffProfile(body, req, Staff, "staff"),
    afterUpdate: async (row) => { await syncUserFromProfile(row); },
    beforeRemove: guardProfileRemoval(Staff, "Staff"),
    decorate: (row) => {
      const p = typeof row.toJSON === "function" ? row.toJSON() : { ...row };
      p.username = p.user?.username ?? ""; p.loginActive = p.user?.isActive ?? false;
      p.employeeTypeLabel = roleLabel(String(p.employeeType ?? "staff")); p.fullName = `${p.firstName ?? ""} ${p.lastName ?? ""}`.trim();
      return p;
    },
  },
];
