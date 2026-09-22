import { Router } from "express";
import { Op } from "sequelize";
import { authenticate } from "../../middlewares/authenticate";
import { authorize } from "../../middlewares/authorize";
import asyncHandler from "../../utils/asyncHandler";
import { ApiResponse } from "../../utils/ApiResponse";
import { parsePagination, buildPaginationMeta } from "../../utils/pagination";
import { Permission } from "../../models";
import { ROLE_PERMISSIONS } from "../../config/permissions";

const router = Router();
router.use(authenticate);

router.get(
  "/",
  authorize("permissions:read"),
  asyncHandler(async (req, res) => {
    const p = parsePagination(req);
    const where = p.search
      ? {
          [Op.or]: [
            { key: { [Op.like]: `%${p.search}%` } },
            { label: { [Op.like]: `%${p.search}%` } },
            { category: { [Op.like]: `%${p.search}%` } },
          ],
        }
      : {};
    const { rows, count } = await Permission.findAndCountAll({
      where,
      limit: p.limit,
      offset: p.offset,
      order: req.query.sort ? p.sort : [["category", "ASC"], ["key", "ASC"]],
      distinct: true,
    });
    ApiResponse.success(res, 200, "Permissions", rows, buildPaginationMeta(p.page, p.limit, count));
  })
);

router.get(
  "/by-role",
  authorize("permissions:read"),
  asyncHandler(async (_req, res) => {
    ApiResponse.success(res, 200, "Permissions by role", ROLE_PERMISSIONS);
  })
);

router.post(
  "/",
  authorize("permissions:create"),
  asyncHandler(async (req, res) => {
    const body = req.body as Record<string, string>;
    const perm = await Permission.create({
      key: body.key,
      label: body.label ?? body.key,
      category: body.category ?? "custom",
    });
    ApiResponse.success(res, 201, "Permission created", perm);
  })
);

router.delete(
  "/:id",
  authorize("permissions:delete"),
  asyncHandler(async (req, res) => {
    await Permission.destroy({ where: { id: req.params.id } });
    ApiResponse.success(res, 200, "Permission deleted", null);
  })
);

export default router;