import { Router } from "express";

import { authenticate } from "../../middlewares/authenticate";
import { authorize } from "../../middlewares/authorize";
import asyncHandler from "../../utils/asyncHandler";
import { ApiResponse } from "../../utils/ApiResponse";
import { ApiError } from "../../utils/ApiError";
import { sequelize } from "../../database/sequelize";
import { generateRandomPassword } from "../../utils/password.util";
import { writeAuditLog } from "../../services/audit.service";
import { User, Staff } from "../../models";
import { createUser } from "../users/users.service";
import { cleanEmail, cleanGender, cleanPhone } from "../students/students.service";
import { EMPLOYEE_ROLES, roleLabel } from "./employees.service";

const router = Router();
router.use(authenticate);

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.+|\.+$/g, "");

/**
 * One step to hire someone: creates the login AND the employee profile, returns the login details once.
 * (Before this, an admin had to create a user, then open Staff and fill the profile in a second place.)
 */
router.post("/", authorize("users:create"), authorize("staff:create"), asyncHandler(async (req, res) => {
  const b = req.body ?? {};
  const branchId = Number(req.user?.branchId);
  if (!Number.isInteger(branchId) || branchId <= 0) throw ApiError.badRequest("User is not assigned to a branch");

  const firstName = String(b.firstName ?? "").trim();
  const lastName = String(b.lastName ?? "").trim();
  const role = String(b.role ?? "staff").trim();
  if (!firstName) throw ApiError.badRequest("First name is required");
  if (firstName.length > 120 || lastName.length > 120) throw ApiError.badRequest("Name is too long");
  if (!EMPLOYEE_ROLES.has(role)) throw ApiError.badRequest("Role must be an employee role (teacher, staff, accountant, librarian, hostel warden, transport manager, receptionist or principal)");
  const email = cleanEmail(b.email);
  if (!email) throw ApiError.badRequest("Email is required (it is the employee's login address)");
  const phone = cleanPhone(b.phone, "Phone");
  const gender = cleanGender(b.gender);
  const salary = b.basicSalary === undefined || b.basicSalary === "" || b.basicSalary === null ? 0 : Number(b.basicSalary);
  if (!Number.isFinite(salary) || salary < 0) throw ApiError.badRequest("Basic salary must be zero or more");
  let hireDate = new Date();
  if (b.hireDate) {
    hireDate = new Date(String(b.hireDate));
    if (!Number.isFinite(hireDate.getTime())) throw ApiError.badRequest("Hire date is not a valid date");
  }

  const password = generateRandomPassword();
  const result = await sequelize.transaction(async (t) => {
    let username = slug(String(b.username ?? "").trim() || `${firstName}.${lastName}` || email.split("@")[0]).slice(0, 40);
    if (username.length < 3) username = `${username}.emp`.slice(0, 40);
    const root = username;
    for (let i = 2; await User.findOne({ where: { username }, transaction: t }); i++) username = `${root}${i}`.slice(0, 50);

    const user = await createUser({
      username, email, firstName, lastName, role, gender: gender ?? undefined, phone: phone ?? undefined,
      branchId, password, sendWelcome: true, generatedBy: req.user!.id, transaction: t,
    });
    const staff = await Staff.findOne({ where: { userId: user.id }, transaction: t });
    if (!staff) throw ApiError.internal("Employee profile was not created");
    await staff.update({
      department: b.department ? String(b.department).trim() : staff.department,
      designation: b.designation ? String(b.designation).trim() : staff.designation,
      hireDate, basicSalary: salary,
    }, { transaction: t });
    return { user, staff };
  });

  await writeAuditLog({
    action: "create", entity: "employee", entityId: result.staff.id, userId: req.user!.id, role: req.user!.role,
    branchId, ip: req.ip, newData: { staffNo: result.staff.staffNo, role },
  } as any);
  ApiResponse.success(res, 201, "Employee added", {
    employee: result.staff,
    credentials: [{ role: "staff", name: `${firstName} ${lastName}`.trim(), username: result.user.username, password }],
    roleLabel: roleLabel(role),
  });
}));

/** Counts for the Employees page header. */
router.get("/summary", authorize("staff:read"), asyncHandler(async (req, res) => {
  const where: any = { isActive: true, ...(req.user!.branchId != null ? { branchId: req.user!.branchId } : {}) };
  const rows = (await Staff.findAll({ where, attributes: ["employeeType", "basicSalary"] })) as Staff[];
  const byType: Record<string, number> = {};
  let withoutSalary = 0;
  for (const r of rows) {
    byType[r.employeeType] = (byType[r.employeeType] || 0) + 1;
    if (!(Number(r.basicSalary) > 0)) withoutSalary++;
  }
  ApiResponse.success(res, 200, "Employee summary", { total: rows.length, byType, withoutSalary });
}));

export default router;
