import { Router } from "express";
import { Op } from "sequelize";
import { authenticate } from "../../middlewares/authenticate";
import { authorize } from "../../middlewares/authorize";
import asyncHandler from "../../utils/asyncHandler";
import { ApiResponse } from "../../utils/ApiResponse";
import { ApiError } from "../../utils/ApiError";
import { parsePagination, buildPaginationMeta } from "../../utils/pagination";
import { likeOp } from "../../utils/search";
import { Role, Permission, RolePermission, User } from "../../models";
import { ROLE_PERMISSIONS } from "../../config/permissions";
import { sequelize } from "../../database/sequelize";
import { writeAuditLog } from "../../services/audit.service";

const router = Router();
router.use(authenticate);

// Who can do what (used by the UI permission matrix).
router.get(
  "/matrix",
  authorize("roles:read"),
  asyncHandler(async (_req, res) => {
    ApiResponse.success(res, 200, "Permission matrix", ROLE_PERMISSIONS);
  })
);

router.get(
  "/:role/permissions",
  authorize("roles:read"),
  asyncHandler(async (req, res) => {
    const role = await Role.findOne({ where: { name: req.params.role } });
    if (!role) return ApiResponse.error(res, 404, "Role not found");
    const perms = await RolePermission.findAll({ where: { roleId: role.name } });
    ApiResponse.success(res, 200, "Role permissions", perms.map((p) => p.permissionKey));
  })
);

router.put(
  "/:role/permissions",
  authorize("roles:update"),
  asyncHandler(async (req, res) => {
    const role = await Role.findOne({ where: { name: req.params.role } });
    if (!role) return ApiResponse.error(res, 404, "Role not found");
    // System-defined roles (the ones seeded) cannot have permissions stripped by branch admins.
    const isSystem = Boolean(role.isSystem);
    if (isSystem && req.user?.role !== "super_admin") {
      throw ApiError.forbidden("System role permissions can only be changed by super_admin");
    }
    const keys = Array.isArray(req.body) ? (req.body as string[]) : [];
    // Wrap destroy + bulkCreate in a transaction so we don't end up with a role that has
    // zero permissions if the bulk create fails midway.
    await sequelize.transaction(async (t) => {
      await RolePermission.destroy({ where: { roleId: role.name }, transaction: t });
      if (keys.length) {
        await RolePermission.bulkCreate(
          keys.map((k) => ({ roleId: role.name, permissionKey: k })),
          { transaction: t }
        );
      }
    });
    await writeAuditLog({
      action: "update",
      entity: "role_permission",
      entityId: role.name,
      userId: req.user?.id,
      role: req.user?.role,
      branchId: req.user?.branchId,
      newData: { keys },
    });
    ApiResponse.success(res, 200, "Role permissions updated", keys);
  })
);

router.get(
  "",
  authorize("roles:read"),
  asyncHandler(async (req, res) => {
    const p = parsePagination(req);
    const where = p.search
      ? {
          [Op.or]: [
            { name: { [likeOp]: `%${p.search}%` } },
            { label: { [likeOp]: `%${p.search}%` } },
          ],
        }
      : {};
    const { rows, count } = await Role.findAndCountAll({
      where,
      limit: p.limit,
      offset: p.offset,
      order: req.query.sort ? p.sort : [["name", "ASC"]],
      distinct: true,
    });
    ApiResponse.success(res, 200, "Roles", rows, buildPaginationMeta(p.page, p.limit, count));
  })
);

router.post(
  "",
  authorize("roles:create"),
  asyncHandler(async (req, res) => {
    const { name, label, description } = req.body as Record<string, string>;
    if (!name) return ApiResponse.error(res, 400, "name is required");
    const role = await Role.create({ name, label: label ?? name, description });
    ApiResponse.success(res, 201, "Role created", role);
  })
);

router.put(
  "/:id",
  authorize("roles:update", "roles:create"),
  asyncHandler(async (req, res) => {
    const role = await Role.findByPk(req.params.id);
    if (!role) throw ApiError.notFound("Role not found");
    const { label, description } = req.body as Record<string, string>;
    await role.update({
      ...(label !== undefined ? { label } : {}),
      ...(description !== undefined ? { description } : {}),
    });
    ApiResponse.success(res, 200, "Role updated", role);
  })
);

router.delete(
  "/:id",
  authorize("roles:delete"),
  asyncHandler(async (req, res) => {
    const role = await Role.findByPk(req.params.id);
    if (!role) throw ApiError.notFound("Role not found");
    // Block deletion of system roles (super_admin, admin, etc.).
    if (role.isSystem) {
      throw ApiError.badRequest("System roles cannot be deleted");
    }
    // Block deletion if any user is still assigned to this role.
    const userCount = await User.count({ where: { role: role.name } });
    if (userCount > 0) {
      throw ApiError.conflict(`Role is assigned to ${userCount} user(s); reassign them first`);
    }
    await sequelize.transaction(async (t) => {
      await RolePermission.destroy({ where: { roleId: role.name }, transaction: t });
      await role.destroy({ transaction: t });
    });
    await writeAuditLog({
      action: "delete",
      entity: "role",
      entityId: role.name,
      userId: req.user?.id,
      role: req.user?.role,
      branchId: req.user?.branchId,
      oldData: { name: role.name },
    });
    ApiResponse.success(res, 200, "Role deleted", null);
  })
);

router.get(
  "/permissions/list",
  authorize("roles:read"),
  asyncHandler(async (_req, res) => {
    ApiResponse.success(res, 200, "Permissions", await Permission.findAll());
  })
);

export default router;