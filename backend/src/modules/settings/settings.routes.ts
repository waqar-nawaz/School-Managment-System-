import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate";
import { authorize } from "../../middlewares/authorize";
import asyncHandler from "../../utils/asyncHandler";
import { ApiResponse } from "../../utils/ApiResponse";
import { ApiError } from "../../utils/ApiError";
import { Settings } from "../../models";
import { sequelize } from "../../database/sequelize";
import { z } from "zod";
import { validate } from "../../middlewares/validate";
import { writeAuditLog } from "../../services/audit.service";

const router = Router();

// Scopes that hold internal state (password-reset / e-mail-verify tokens use "reset:<id>" and
// "verify:<id>", role overrides use "rbac"). They must never be readable or writable through
// this generic settings API - an admin could otherwise forge a reset token for any account.
const RESERVED_SCOPES = new Set(["rbac"]);
const SCOPE_RE = /^[a-z][a-z0-9_-]{0,59}$/i;
function assertUserScope(scope: string): string {
  if (!SCOPE_RE.test(scope) || RESERVED_SCOPES.has(scope.toLowerCase())) {
    throw ApiError.badRequest("Invalid or reserved settings scope");
  }
  return scope;
}

const upsertSchema = z.object({
  scope: z.string().min(1).max(60).regex(SCOPE_RE, "Invalid scope").refine((v) => !RESERVED_SCOPES.has(v.toLowerCase()), "Reserved scope").optional().default("system"),
  key: z.string().min(1).max(120),
  value: z.string().max(10000),
  description: z.string().max(1000).optional(),
  isPublic: z.boolean().optional(),
});

// Public settings (locale, school name, contact info) — no auth needed.
router.get(
  "/public",
  asyncHandler(async (_req, res) => {
    const rows = await Settings.findAll({ where: { isPublic: true, scope: "system" } });
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
    const scope = assertUserScope((req.query.scope as string) || "system");
    const rows = await Settings.findAll({ where: { scope } });
    // Return shape: { [key]: { value, isPublic } } so the frontend can preserve the isPublic flag
    // across load → edit → save cycles. Previously this returned a flat string map, which silently
    // wiped isPublic to false on every save.
    const map: Record<string, { value: string; isPublic: boolean; description?: string }> = {};
    for (const r of rows) {
      map[r.key] = { value: r.value, isPublic: Boolean(r.isPublic), description: r.description ?? undefined };
    }
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
    await writeAuditLog({
      action: "update",
      entity: "settings",
      entityId: key,
      userId: req.user?.id,
      role: req.user?.role,
      branchId: req.user?.branchId,
      newData: { scope, value, isPublic: isPublic ?? false },
    });
    ApiResponse.success(res, 200, "Setting saved", { key, value });
  })
);

router.post(
  "/bulk",
  authorize("settings:manage"),
  asyncHandler(async (req, res) => {
    const entries = Array.isArray(req.body) ? req.body : [];
    const saved: string[] = [];
    const errors: Array<{ index: number; key?: string; errors: unknown[] }> = [];
    entries.forEach((e, index) => {
      const parsed = upsertSchema.safeParse(e);
      if (!parsed.success) {
        errors.push({ index, key: typeof e?.key === "string" ? e.key : undefined, errors: parsed.error.issues });
        return;
      }
      saved.push(parsed.data.key);
    });
    // Wrap in a transaction so partial failures don't leave a mixed state.
    await sequelize.transaction(async (t) => {
      for (const e of entries) {
        const parsed = upsertSchema.safeParse(e);
        if (!parsed.success) continue;
        await Settings.upsert(parsed.data, { transaction: t });
      }
    });
    await writeAuditLog({
      action: "update",
      entity: "settings",
      userId: req.user?.id,
      role: req.user?.role,
      branchId: req.user?.branchId,
      newData: { saved: saved.length, errors: errors.length },
    });
    ApiResponse.success(res, 200, `Saved ${saved.length} of ${entries.length} settings`, { saved, errors });
  })
);

router.delete(
  "/",
  authorize("settings:manage"),
  asyncHandler(async (req, res) => {
    const { scope, key } = req.query as { scope?: string; key?: string };
    if (!key) throw ApiError.badRequest("key query param required");
    if (!scope) throw ApiError.badRequest("scope query param required");
    assertUserScope(scope);
    await Settings.destroy({ where: { key, scope } });
    await writeAuditLog({
      action: "delete",
      entity: "settings",
      entityId: key,
      userId: req.user?.id,
      role: req.user?.role,
      branchId: req.user?.branchId,
      oldData: { scope, key },
    });
    ApiResponse.success(res, 200, "Setting deleted", null);
  })
);

export default router;