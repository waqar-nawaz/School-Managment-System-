import { Router, Request, Response } from "express";
import { authenticate } from "../../middlewares/authenticate";
import { authorize } from "../../middlewares/authorize";
import { createCrudController, CrudOptions } from "../../utils/crudFactory";
import { asyncHandler } from "../../utils/asyncHandler";
import { RESOURCES, ResourceDefinition } from "./resourceDefinitions";
import { exportCsv } from "../../utils/csvExport";
import { ApiError } from "../../utils/ApiError";

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
    afterUpdate: def.afterUpdate,
    afterRemove: def.afterRemove,
    scopeWhere: def.scopeWhere,
    hideAttributes: def.hideAttributes,
    sensitiveColumns: def.sensitiveColumns,
    includes: def.includes,
    decorate: def.decorate,
  } as CrudOptions);

  router.use(authenticate);

  const canRead = def.path === "leaves" ? authorize(`${perm}:read`, `${perm}:approve`) : authorize(`${perm}:read`);
  const canUpdate = def.path === "leaves" ? authorize(`${perm}:update`, `${perm}:approve`) : authorize(`${perm}:update`);

  router.get("/", canRead, (req, res, next) =>
    ctrl.list(req, res).catch(next)
  );
  router.get("/count", canRead, (req, res, next) =>
    ctrl.count(req, res).catch(next)
  );
  // Needs BOTH the export right and read access to this very resource.
  router.get("/export", authorize(`reports:export`), authorize(`${perm}:read`), exportCsv(def.model, def.path, ctrl));
  router.get("/:id", canRead, (req, res, next) =>
    ctrl.getOne(req, res).catch(next)
  );

  // Notifications are intentionally read-only as a resource, but the recipient
  // still needs a narrow endpoint to acknowledge an item as read.
  if (def.path === "notifications") {
    router.patch("/:id/read", authorize("notifications:update"), async (req, res, next) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id)) throw ApiError.badRequest("Invalid id");
        const branchId = req.user?.branchId;
        const where: Record<string, unknown> = { id, userId: req.user?.id };
        if (branchId != null) where.branchId = branchId;
        const row = await def.model.findOne({ where });
        if (!row) throw ApiError.notFound("Notification not found");
        await row.update({ readAt: new Date() });
        res.status(200).json({ success: true, message: "Notification marked as read", data: row });
      } catch (err) {
        next(err);
      }
    });
  }

  if (!def.readonly) {
    router.post("/", authorize(`${perm}:create`), (req, res, next) =>
      ctrl.create(req, res).catch(next)
    );
    router.put("/:id", canUpdate, (req, res, next) =>
      ctrl.update(req, res).catch(next)
    );
    router.delete("/:id", authorize(`${perm}:delete`), (req, res, next) =>
      ctrl.remove(req, res).catch(next)
    );
  }

  return router;
}

export const resourceRouter = Router();
for (const def of RESOURCES) {
  resourceRouter.use(`/${def.path}`, buildRouter(def));
}

export default resourceRouter;