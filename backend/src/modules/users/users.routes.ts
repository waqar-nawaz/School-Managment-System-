import { Router } from "express";
import { validate } from "../../middlewares/validate";
import { authenticate } from "../../middlewares/authenticate";
import { authorize } from "../../middlewares/authorize";
import { createCrudController } from "../../utils/crudFactory";
import asyncHandler from "../../utils/asyncHandler";
import { ApiResponse } from "../../utils/ApiResponse";
import { ApiError } from "../../utils/ApiError";
import {
  User, RefreshToken, Notification, Message, Student, Teacher, Staff, Parent, AuditLog, Branch, Role,
} from "../../models";
import { sequelize } from "../../database/sequelize";
import { sanitize } from "../auth/auth.controller";
import {
  createUserSchema,
  updateUserSchema,
  updateUserStatusSchema,
  adminResetPasswordSchema,
} from "./users.validation";
import { createUser, adminResetPassword, ensureRoleProfile, assertIdentityFree } from "./users.service";
import { releaseWardenPost } from "../employees/employees.service";
import { invalidateActiveCache } from "../../middlewares/authenticate";
import { writeAuditLog } from "../../services/audit.service";
import { likeOp } from "../../utils/search";

const router = Router();
router.use(authenticate);

const base = createCrudController<User>({
  model: User,
  searchable: ["username", "email", "firstName", "lastName", "role", "phone"],
  defaultSort: [["createdAt", "DESC"]],
});

router.get("/", authorize("users:read"), asyncHandler(async (req, res) => {
  const { Op } = await import("sequelize");
  const p = req.query as Record<string, string | undefined>;
  const where: any = {};
  const isSuperAdmin = req.user!.role === "super_admin";
  if (!isSuperAdmin) where.branchId = req.user!.branchId;
  if (isSuperAdmin && p.branchId) where.branchId = Number(p.branchId);
  if (p.role) where.role = p.role;
  if (p.isActive) where.isActive = p.isActive === "true";
  if (p.q) {
    where[Op.or] = ["username", "email", "firstName", "lastName"].map((field) => ({
      [field]: { [likeOp]: `%${p.q}%` },
    }));
  }
  const page = Math.max(1, Number.isFinite(Number(p.page)) ? Number(p.page) : 1);
  const limit = Math.min(100, Math.max(1, Number.isFinite(Number(p.limit)) ? Number(p.limit) : 10));
  const { rows, count } = await User.findAndCountAll({
    where, limit, offset: (page - 1) * limit, order: [["createdAt", "DESC"]],
    attributes: { exclude: ["passwordHash"] },
  });
  ApiResponse.success(res, 200, "Users fetched", rows, {
    page, limit, total: count, totalPages: Math.ceil(count / limit),
  });
}));

const findScopedUser = async (req: any) => {
  const where: any = { id: Number(req.params.id) };
  if (req.user?.role !== "super_admin") where.branchId = req.user?.branchId;
  // Never leak passwordHash — exclude it on every read.
  return User.findOne({ where, attributes: { exclude: ["passwordHash"] } });
};

router.get("/:id", authorize("users:read"), asyncHandler(async (req, res) => {
  const user = await findScopedUser(req);
  if (!user) throw ApiError.notFound("User not found");
  ApiResponse.success(res, 200, "User fetched", sanitize(user));
}));

router.post("/", authorize("users:create"), validate(createUserSchema), asyncHandler(async (req, res) => {
  const body = { ...req.body };
  // A student login without a student record is a ghost account: students are admitted, not "added as users".
  if (body.role === "student") throw ApiError.badRequest("Student logins are created automatically when you admit a student (Students -> Admit student).");
  // Privilege escalation guard: only super_admin can create super_admin users.
  if (body.role === "super_admin" && req.user!.role !== "super_admin") {
    throw ApiError.forbidden("Only super_admin can assign the super_admin role");
  }
  if (req.user!.role !== "super_admin") {
    body.branchId = req.user!.branchId;
  } else if (body.branchId != null) {
    const branch = await Branch.findByPk(body.branchId);
    if (!branch || !branch.isActive) throw ApiError.badRequest("Selected branch is not active");
  } else {
    throw ApiError.badRequest("branchId is required for super admin");
  }
  const user = await createUser({ ...body, generatedBy: req.user!.id });
  ApiResponse.success(res, 201, "User created", sanitize(user));
}));

router.put("/:id", authorize("users:update"), validate(updateUserSchema), asyncHandler(async (req, res) => {
  const user = await findScopedUser(req);
  if (!user) throw ApiError.notFound("User not found");
  if (user.username === "superadmin" && req.user!.role !== "super_admin") {
    throw ApiError.forbidden("Cannot modify the superadmin account");
  }
  // Privilege escalation guards:
  // 1. Only super_admin can promote a user to super_admin.
  // 2. Only super_admin can demote an existing super_admin.
  if (req.body.role === "super_admin" && user.role !== "super_admin" && req.user!.role !== "super_admin") {
    throw ApiError.forbidden("Only super_admin can assign the super_admin role");
  }
  if (user.role === "super_admin" && req.body.role !== undefined && req.body.role !== "super_admin" && req.user!.role !== "super_admin") {
    throw ApiError.forbidden("Only super_admin can demote a super_admin");
  }
  const body = { ...req.body };
  if (req.user!.role !== "super_admin") {
    delete body.branchId;
    body.branchId = req.user!.branchId;
  } else if (body.branchId !== undefined) {
    if (body.branchId == null) throw ApiError.badRequest("User branch cannot be cleared");
    const branch = await Branch.findByPk(body.branchId);
    if (!branch || !branch.isActive) throw ApiError.badRequest("Selected branch is not active");
  }
  if (body.role === "student" && user.role !== "student") throw ApiError.badRequest("A login cannot be turned into a student by changing its role. Admit the student instead.");
  if (body.username !== undefined || body.email !== undefined) {
    await assertIdentityFree({ username: body.username, email: body.email }, user.id);
  }
  if (body.role !== undefined && body.role !== user.role) {
    if (!(await Role.findOne({ where: { name: body.role } }))) throw ApiError.badRequest(`Unknown role "${body.role}"`);
    if (user.id === req.user!.id) throw ApiError.badRequest("You cannot change your own role");
  }
  if (body.isActive === false && user.id === req.user!.id) {
    throw ApiError.badRequest("You cannot deactivate your own account");
  }
  await user.update(body);
  // Role, name, contact or active flag changed: Parent/Staff/Teacher rows must follow the login.
  await ensureRoleProfile(user);
  if (body.isActive === false) {
    // Same as PATCH /status: kill sessions right away.
    await RefreshToken.update({ revoked: true, revokedAt: new Date() }, { where: { userId: user.id, revoked: false } });
  }
  if (body.isActive !== undefined) invalidateActiveCache(user.id);
  await writeAuditLog({
    action: "update", entity: "user", entityId: user.id, userId: req.user!.id,
    role: req.user!.role, newData: body, branchId: user.branchId,
  });
  ApiResponse.success(res, 200, "User updated", sanitize(user));
}));

router.patch("/:id/status", authorize("users:update"), validate(updateUserStatusSchema), asyncHandler(async (req, res) => {
  const user = await findScopedUser(req);
  if (!user) throw ApiError.notFound("User not found");
  if (user.username === "superadmin" && req.user!.role !== "super_admin") {
    throw ApiError.forbidden("Cannot modify the superadmin account");
  }
  if (user.id === req.user!.id && !req.body.isActive) {
    throw ApiError.badRequest("You cannot deactivate your own account");
  }
  await user.update({ isActive: req.body.isActive });
  await ensureRoleProfile(user); // deactivated employees drop out of staff lists and payroll
  invalidateActiveCache(user.id);
  // When deactivating, revoke all refresh tokens so existing JWTs stop working
  // immediately (within the 60s active-cache window in authenticate.ts).
  if (!req.body.isActive) {
    await RefreshToken.update(
      { revoked: true, revokedAt: new Date() },
      { where: { userId: user.id, revoked: false } }
    );
  }
  await writeAuditLog({
    action: "update",
    entity: "user",
    entityId: user.id,
    userId: req.user!.id,
    role: req.user!.role,
    branchId: user.branchId,
    newData: { event: req.body.isActive ? "activated" : "deactivated" },
  });
  ApiResponse.success(res, 200, `User ${req.body.isActive ? "activated" : "deactivated"}`, sanitize(user));
}));

router.post("/:id/reset-password", authorize("users:update"), validate(adminResetPasswordSchema), asyncHandler(async (req, res) => {
  const user = await findScopedUser(req);
  if (!user) throw ApiError.notFound("User not found");
  await adminResetPassword(user.id, req.body.newPassword, req.user!.id);
  // Invalidate all existing refresh tokens so the user must sign in again with the new password.
  await RefreshToken.update(
    { revoked: true, revokedAt: new Date() },
    { where: { userId: user.id, revoked: false } }
  );
  ApiResponse.success(res, 200, "Password reset", null);
}));

router.delete("/:id", authorize("users:delete"), asyncHandler(async (req, res) => {
  const user = await findScopedUser(req);
  if (!user) throw ApiError.notFound("User not found");
  if (user.username === "superadmin") throw ApiError.forbidden("Cannot delete the superadmin account");

  // Capture user details BEFORE delete for the audit log.
  const userSnapshot = {
    username: user.username,
    email: user.email,
    role: user.role,
    branchId: user.branchId,
  };

  try {
    await sequelize.transaction(async (t) => {
      await RefreshToken.destroy({ where: { userId: user.id }, transaction: t });
      await Notification.destroy({ where: { userId: user.id }, transaction: t });
      await Message.destroy({ where: { senderId: user.id }, transaction: t });
      await Student.update({ userId: null }, { where: { userId: user.id }, transaction: t });
      // The login is gone, so the employee leaves payroll/teacher lists (history is kept) and no longer runs a hostel.
      for (const s of await Staff.findAll({ where: { userId: user.id }, attributes: ["id"], transaction: t })) await releaseWardenPost(Number(s.id), t);
      await Teacher.update({ userId: null, isActive: false }, { where: { userId: user.id }, transaction: t });
      await Staff.update({ userId: null, isActive: false }, { where: { userId: user.id }, transaction: t });
      await Parent.update({ userId: null }, { where: { userId: user.id }, transaction: t });
      await AuditLog.update({ userId: null }, { where: { userId: user.id }, transaction: t });
      await user.destroy({ transaction: t });
    });
    await writeAuditLog({
      action: "delete",
      entity: "user",
      entityId: user.id,
      userId: req.user!.id,
      role: req.user!.role,
      branchId: userSnapshot.branchId,
      oldData: userSnapshot,
      newData: { softDeleted: false },
    });
    ApiResponse.success(res, 200, "User deleted", null);
  } catch (err) {
    if ((err as { name?: string }).name !== "SequelizeForeignKeyConstraintError") throw err;
    await user.update({
      isActive: false, emailVerified: false,
      username: `deleted_${user.id}_${user.username}`.slice(0, 120),
      email: `deleted_${user.id}_${user.email}`.slice(0, 180),
    });
    await ensureRoleProfile(user); // profiles of an account that could not be removed are deactivated too
    await writeAuditLog({
      action: "delete",
      entity: "user",
      entityId: user.id,
      userId: req.user!.id,
      role: req.user!.role,
      branchId: userSnapshot.branchId,
      oldData: userSnapshot,
      newData: { softDeleted: true },
    });
    ApiResponse.success(res, 200, "User has linked records, so the account was deactivated instead.", null);
  }
}));

export default router;