import { Router } from "express";
import fs from "fs";
import path from "path";
import { Op } from "sequelize";
import { authenticate } from "../../middlewares/authenticate";
import { authorize } from "../../middlewares/authorize";
import asyncHandler from "../../utils/asyncHandler";
import { ApiResponse } from "../../utils/ApiResponse";
import { ApiError } from "../../utils/ApiError";
import { parsePagination, buildPaginationMeta } from "../../utils/pagination";
import { likeOp } from "../../utils/search";
import { upload, uploadMultiple, UPLOAD_ROOT } from "../../middlewares/upload";
import { Media } from "../../models";

const router = Router();
router.use(authenticate);

router.post(
  "/upload",
  authorize("media:create"),
  uploadMultiple("files", 10),
  asyncHandler(async (req, res) => {
    const files = (req.files ?? []) as Express.Multer.File[];
    if (!files.length) throw ApiError.badRequest("No files provided");

    const rows = await Media.bulkCreate(
      files.map((f) => ({
        filename: f.originalname,
        path: `/uploads/${f.filename}`,
        mimeType: f.mimetype,
        size: f.size,
        category: String(req.body.category || "general"),
        uploadedBy: req.user!.id,
      }))
    );

    ApiResponse.success(res, 201, `${rows.length} file(s) uploaded`, rows);
  })
);

router.get("/", authorize("media:read"), asyncHandler(async (req, res) => {
  const category = req.query.category ? String(req.query.category) : undefined;
  const p = parsePagination(req);
  const where: Record<string, unknown> = { ...(category ? { category } : {}) };
  if (p.search) {
    where[Op.or as unknown as string] = [
      { originalName: { [likeOp]: `%${p.search}%` } },
      { mimeType: { [likeOp]: `%${p.search}%` } },
    ];
  }
  const { rows, count } = await Media.findAndCountAll({
    where,
    limit: p.limit,
    offset: p.offset,
    order: req.query.sort ? p.sort : [["createdAt", "DESC"]],
    distinct: true,
  });
  ApiResponse.success(res, 200, "Media list", rows, buildPaginationMeta(p.page, p.limit, count));
}));

router.get("/:id", authorize("media:read"), asyncHandler(async (req, res) => {
  const row = await Media.findByPk(req.params.id);
  if (!row) throw ApiError.notFound("File not found");
  ApiResponse.success(res, 200, "Media metadata", row);
}));

router.delete("/:id", authorize("media:delete"), asyncHandler(async (req, res) => {
  const row = await Media.findByPk(req.params.id);
  if (!row) throw ApiError.notFound("File not found");
  try {
    const abs = path.join(UPLOAD_ROOT, path.basename(row.path));
    if (fs.existsSync(abs)) fs.unlinkSync(abs);
  } catch {
    /* file already gone */
  }
  await row.destroy();
  ApiResponse.success(res, 200, "File deleted", null);
}));

export default router;