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

const currentBranchId = (req: any): number => {
  const id = Number(req.user?.branchId);
  if (!Number.isInteger(id) || id <= 0) throw ApiError.forbidden("User is not assigned to a branch");
  return id;
};

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
        category: String(req.body.category || "general").trim().slice(0, 40),
        uploadedBy: req.user!.id,
        branchId: currentBranchId(req),
      }))
    );

    ApiResponse.success(res, 201, `${rows.length} file(s) uploaded`, rows);
  })
);

router.get("/", authorize("media:read"), asyncHandler(async (req, res) => {
  const category = req.query.category ? String(req.query.category) : undefined;
  const p = parsePagination(req);
  const where: Record<string, unknown> = { branchId: currentBranchId(req), ...(category ? { category } : {}) };
  if (p.search) {
    where[Op.or as unknown as string] = [
      { filename: { [likeOp]: `%${p.search}%` } },
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
  const row = await Media.findOne({ where: { id: req.params.id, branchId: currentBranchId(req) } });
  if (!row) throw ApiError.notFound("File not found");
  ApiResponse.success(res, 200, "Media metadata", row);
}));

router.delete("/:id", authorize("media:delete"), asyncHandler(async (req, res) => {
  const row = await Media.findOne({ where: { id: req.params.id, branchId: currentBranchId(req) } });
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