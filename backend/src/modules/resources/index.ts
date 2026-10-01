import { Router, Request, Response } from "express";
import { authenticate } from "../../middlewares/authenticate";
import { authorize } from "../../middlewares/authorize";
import { createCrudController, CrudOptions } from "../../utils/crudFactory";
import { asyncHandler } from "../../utils/asyncHandler";
import { RESOURCES, ResourceDefinition } from "./resourceDefinitions";
import { writeAuditLog } from "../../services/audit.service";

function buildRouter(def: ResourceDefinition): Router {
  const router = Router();
  const perm = def.permission;
  const ctrl = createCrudController<any>({
    model: def.model,
    searchable: def.searchable,
    defaultSort: def.defaultSort ?? [["createdAt", "DESC"]],
    beforeCreate: def.beforeCreate,
    beforeUpdate: def.beforeUpdate,
    beforeRemove: def.beforeRemove,
    afterCreate: def.afterCreate,
    scopeWhere: def.scopeWhere,
    hideAttributes: def.hideAttributes,
    sensitiveColumns: def.sensitiveColumns,
    includes: def.includes,
    decorate: def.decorate,
  } as CrudOptions);

  router.use(authenticate);

  router.get("/", authorize(`${perm}:read`), (req, res, next) =>
    ctrl.list(req, res).catch(next)
  );
  router.get("/count", authorize(`${perm}:read`), (req, res, next) =>
    ctrl.count(req, res).catch(next)
  );
  // Needs BOTH the export right and read access to this very resource.
  router.get("/export", authorize(`reports:export`), authorize(`${perm}:read`), exportCsv(def, ctrl));
  router.get("/:id", authorize(`${perm}:read`), (req, res, next) =>
    ctrl.getOne(req, res).catch(next)
  );

  if (!def.readonly) {
    router.post("/", authorize(`${perm}:create`), (req, res, next) =>
      ctrl.create(req, res).catch(next)
    );
    router.put("/:id", authorize(`${perm}:update`), (req, res, next) =>
      ctrl.update(req, res).catch(next)
    );
    router.delete("/:id", authorize(`${perm}:delete`), (req, res, next) =>
      ctrl.remove(req, res).catch(next)
    );
  }

  return router;
}

/** Neutralise spreadsheet formulas (=, +, -, @) so opened CSVs can't run code in Excel. */
function csvCell(v: unknown): string {
  let s = v == null ? "" : v instanceof Date ? v.toISOString() : typeof v === "object" ? JSON.stringify(v) : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  s = s.replace(/"/g, '""');
  return /[",\n\r]/.test(s) ? `"${s}"` : s;
}

function exportCsv(def: ResourceDefinition, ctrl: ReturnType<typeof createCrudController>) {
  return asyncHandler(async (req: Request, res: Response) => {
    // Same filters, search, branch scope and row-level scope as the list screen.
    const where = await ctrl.buildWhere(req);
    const hidden = new Set([
      "passwordHash", "passwordChangedAt", "secret", "tokenHash", "lastLoginIp", "deletedAt", "userAgent",
      ...ctrl.hiddenColumns(req),
    ]);
    const attrs = Object.keys((def.model as any).rawAttributes || {}).filter((a) => !hidden.has(a));
    const rows = await def.model.findAll({ where, limit: 5000, raw: true, attributes: attrs });

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${def.path}-${Date.now()}.csv"`);
    if (!rows.length) {
      res.send(attrs.join(","));
      return;
    }
    const csv = [
      attrs.join(","),
      ...rows.map((r: any) => attrs.map((h) => csvCell(r[h])).join(",")),
    ].join("\r\n");
    // Report truncation so clients know the export is incomplete.
    if (rows.length === 5000) {
      res.setHeader("X-Export-Truncated", "true");
      res.setHeader("X-Export-Max-Rows", "5000");
    }
    res.send("\uFEFF" + csv); // BOM so Excel reads UTF-8 (Urdu names) correctly

    await writeAuditLog({
      action: "export",
      entity: def.path,
      userId: req.user?.id ?? null,
      branchId: req.user?.branchId ?? null,
      role: req.user?.role,
      ip: req.ip,
      newData: { format: "csv", rowCount: rows.length, truncated: rows.length === 5000 },
    });
  });
}

export const resourceRouter = Router();
for (const def of RESOURCES) {
  resourceRouter.use(`/${def.path}`, buildRouter(def));
}

export default resourceRouter;