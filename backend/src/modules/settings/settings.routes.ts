import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate";
import { authorize } from "../../middlewares/authorize";
import asyncHandler from "../../utils/asyncHandler";
import { ApiResponse } from "../../utils/ApiResponse";
import { ApiError } from "../../utils/ApiError";
import { Settings } from "../../models";
import { z } from "zod";
import { validate } from "../../middlewares/validate";

const router = Router();

const upsertSchema = z.object({
  scope: z.string().min(1).max(60).optional().default("system"),
  key: z.string().min(1).max(120),
  value: z.string().max(10000),
  description: z.string().max(1000).optional(),
  isPublic: z.boolean().optional(),
});

// Public settings (locale, school name, contact info) — no auth needed.
router.get(
  "/public",
  asyncHandler(async (_req, res) => {
    const rows = await Settings.findAll({ where: { isPublic: true } });
    const map: Record<string, string> = {};
    for (const r of rows) map[r.key] = r.value;
    ApiResponse.success(res, 200, "Public settings", map);
  })
);

router.use(authenticate);

router.get(
  "/",
  authorize("settings:manage"),
  asyncHandler(async (req, res) => {
    const scope = (req.query.scope as string) || "system";
    const rows = await Settings.findAll({ where: { scope } });
    const map: Record<string, string> = {};
    for (const r of rows) map[r.key] = r.value;
    ApiResponse.success(res, 200, "Settings fetched", map);
  })
);

router.post(
  "/",
  authorize("settings:manage"),
  validate(upsertSchema),
  asyncHandler(async (req, res) => {
    const { scope, key, value, description, isPublic } = req.body;
    await Settings.upsert({ scope, key, value, description, isPublic: isPublic ?? false });
    ApiResponse.success(res, 200, "Setting saved", { key, value });
  })
);

router.post(
  "/bulk",
  authorize("settings:manage"),
  asyncHandler(async (req, res) => {
    const entries = Array.isArray(req.body) ? req.body : [];
    for (const e of entries) {
      const parsed = upsertSchema.safeParse(e);
      if (!parsed.success) continue;
      await Settings.upsert(parsed.data);
    }
    ApiResponse.success(res, 200, `Saved ${entries.length} settings`, null);
  })
);

router.delete(
  "/",
  authorize("settings:manage"),
  asyncHandler(async (req, res) => {
    const { scope, key } = req.query as { scope?: string; key?: string };
    if (!key) throw ApiError.badRequest("key query param required");
    await Settings.destroy({ where: { key, ...(scope ? { scope } : {}) } });
    ApiResponse.success(res, 200, "Setting deleted", null);
  })
);

export default router;