import { Router, Request, Response } from "express";
import { authenticate } from "../../middlewares/authenticate";
import { authorize } from "../../middlewares/authorize";
import { createCrudController, CrudOptions } from "../../utils/crudFactory";
import { asyncHandler } from "../../utils/asyncHandler";
import { parsePagination } from "../../utils/pagination";
import { RESOURCES, ResourceDefinition } from "./resourceDefinitions";
import { writeAuditLog } from "../../services/audit.service";

function buildRouter(def: ResourceDefinition): Router {
  const router = Router();
  const perm = def.permission;
  const ctrl = createCrudController<any>({
    model: def.model,
    searchable: def.searchable,
    defaultSort: def.defaultSort ?? [["createdAt", "DESC"]],
  } as CrudOptions);

  router.use(authenticate);

  router.get("/", authorize(`${perm}:read`), (req, res, next) =>
    ctrl.list(req, res).catch(next)
  );
  router.get("/count", authorize(`${perm}:read`), (req, res, next) =>
    ctrl.count(req, res).catch(next)
  );
  router.get("/export", authorize(`reports:export`), exportCsv(def));
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

function exportCsv(def: ResourceDefinition) {
  return asyncHandler(async (req: Request, res: Response) => {
    const p = parsePagination(req, 5000);
    const where: Record<string, unknown> = {};
    if (p.search) {
      const { Op } = await import("sequelize");
      (where as any)[Op.or] = def.searchable.map((col) => ({
        [col]: { [Op.like]: `%${p.search}%` },
      }));
    }
    const rows = await def.model.findAll({ where, limit: 5000, raw: true });
    if (!rows.length) {
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${def.path}-${Date.now()}.csv"`
      );
      res.send("");
      return;
    }
    const headers = Object.keys(rows[0] as Record<string, unknown>);
    const escape = (v: unknown) => {
      const s = v == null ? "" : String(v).replace(/"/g, '""');
      return /[",\n]/.test(s) ? `"${s}"` : s;
    };
    const csv = [
      headers.join(","),
      ...rows.map((r: any) => headers.map((h) => escape(r[h])).join(",")),
    ].join("\r\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${def.path}-${Date.now()}.csv"`
    );
    res.send(csv);

    await writeAuditLog({
      action: "export",
      entity: def.path,
      userId: req.user?.id ?? null,
      role: req.user?.role,
      ip: req.ip,
      newData: { format: "csv" },
    });
  });
}

export const resourceRouter = Router();
for (const def of RESOURCES) {
  resourceRouter.use(`/${def.path}`, buildRouter(def));
}

export default resourceRouter;