import { Router } from "express";
import { validate } from "../../middlewares/validate";
import { authenticate } from "../../middlewares/authenticate";
import { authorize } from "../../middlewares/authorize";
import { createCrudController } from "../../utils/crudFactory";
import asyncHandler from "../../utils/asyncHandler";
import { ApiResponse } from "../../utils/ApiResponse";
import { ApiError } from "../../utils/ApiError";
import {
  User, RefreshToken, Notification, Message, Student, Teacher, Staff, Parent, AuditLog,
} from "../../models";
import { sequelize } from "../../database/sequelize";
import { sanitize } from "../auth/auth.controller";
import {
  createUserSchema,
  updateUserSchema,
  updateUserStatusSchema,
  adminResetPasswordSchema,
} from "./users.validation";
import { createUser, adminResetPassword } from "./users.service";
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
  if (p.role) where.role = p.role;
  if (p.isActive) where.isActive = p.isActive === "true";
  if (p.q) {
    where[Op.or] = ["username", "email", "firstName", "lastName"].map((c) => ({
      [c]: { [likeOp]: `%${p.q}%` },
    }));
  }
  const page = Math.max(1, Number.isFinite(Number(p.page)) ? Number(p.page) : 1);
  const limit = Math.min(100, Math.max(1, Number.isFinite(Number(p.limit)) ? Number(p.limit) : 10));
  const { rows, count } = await User.findAndCountAll({
    where,
    limit,
    offset: (page - 1) * limit,
    order: [["createdAt", "DESC"]],
    attributes: { exclude: ["passwordHash"] },
  });
  ApiResponse.success(res, 200, "Users fetched", rows, {
    page,
    limit,
    total: count,
    totalPages: Math.ceil(count / limit),
  });
}));

router.get("/:id", authorize("users:read"), asyncHandler(async (req, res) => {
  const user = await User.findByPk(req.params.id, {
    attributes: { exclude: ["passwordHash"] },
  });
  if (!user) throw ApiError.notFound("User not found");
  ApiResponse.success(res, 200, "User fetched", user);
}));

router.post("/", authorize("users:create"), validate(createUserSchema), asyncHandler(async (req, res) => {
  const user = await createUser({ ...req.body, generatedBy: req.user!.id });
  ApiResponse.success(res, 201, "User created", sanitize(user));
}));

router.put("/:id", authorize("users:update"), validate(updateUserSchema), asyncHandler(async (req, res) => {
  const user = await User.findByPk(req.params.id);
  if (!user) throw ApiError.notFound("User not found");
  if (user.username === "superadmin" && req.user!.role !== "super_admin") {
    throw ApiError.forbidden("Cannot modify the superadmin account");
  }
  await user.update(req.body);
  await writeAuditLog({
    action: "update",
    entity: "user",
    entityId: user.id,
    userId: req.user!.id,
    role: req.user!.role,
    newData: req.body,
  });
  ApiResponse.success(res, 200, "User updated", sanitize(user));
}));

router.patch("/:id/status", authorize("users:update"), validate(updateUserStatusSchema), asyncHandler(async (req, res) => {
  const user = await User.findByPk(req.params.id);
  if (!user) throw ApiError.notFound("User not found");
  await user.update({ isActive: req.body.isActive });
  ApiResponse.success(res, 200, `User ${req.body.isActive ? "activated" : "deactivated"}`, sanitize(user));
}));

router.post("/:id/reset-password", authorize("users:update"), validate(adminResetPasswordSchema), asyncHandler(async (req, res) => {
  await adminResetPassword(Number(req.params.id), req.body.newPassword, req.user!.id);
  ApiResponse.success(res, 200, "Password reset", null);
}));

router.delete("/:id", authorize("users:delete"), asyncHandler(async (req, res) => {
  const user = await User.findByPk(req.params.id);
  if (!user) throw ApiError.notFound("User not found");
  if (user.username === "superadmin") throw ApiError.forbidden("Cannot delete the superadmin account");

  try {
    await sequelize.transaction(async (t) => {
      // Remove rows that must reference a user...
      await RefreshToken.destroy({ where: { userId: user.id }, transaction: t });
      await Notification.destroy({ where: { userId: user.id }, transaction: t });
      await Message.destroy({ where: { senderId: user.id }, transaction: t });
      // ...and detach nullable profile links so they survive.
      await Student.update({ userId: null }, { where: { userId: user.id }, transaction: t });
      await Teacher.update({ userId: null }, { where: { userId: user.id }, transaction: t });
      await Staff.update({ userId: null }, { where: { userId: user.id }, transaction: t });
      await Parent.update({ userId: null }, { where: { userId: user.id }, transaction: t });
      await AuditLog.update({ userId: null }, { where: { userId: user.id }, transaction: t });
      await user.destroy({ transaction: t });
    });
    ApiResponse.success(res, 200, "User deleted", null);
  } catch (err) {
    // Still referenced elsewhere (e.g. book issues, leave requests) — deactivate
    // and free up the username/email instead of leaving a broken account.
    if ((err as { name?: string }).name !== "SequelizeForeignKeyConstraintError") throw err;
    await user.update({
      isActive: false,
      emailVerified: false,
      username: `deleted_${user.id}_${user.username}`.slice(0, 120),
      email: `deleted_${user.id}_${user.email}`.slice(0, 180),
    });
    ApiResponse.success(
      res,
      200,
      "User has linked records, so the account was deactivated instead. Link with a different account if needed.",
      null
    );
  }
}));

export default router;