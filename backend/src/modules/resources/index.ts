import { Router, Request, Response } from "express";
import { authenticate } from "../../middlewares/authenticate";
import { authorize } from "../../middlewares/authorize";
import { createCrudController, CrudOptions } from "../../utils/crudFactory";
import { asyncHandler } from "../../utils/asyncHandler";
import { RESOURCES, ResourceDefinition } from "./resourceDefinitions";
import { exportCsv } from "../../utils/csvExport";

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

  router.get("/", authorize(`${perm}:read`), (req, res, next) =>
    ctrl.list(req, res).catch(next)
  );
  router.get("/count", authorize(`${perm}:read`), (req, res, next) =>
    ctrl.count(req, res).catch(next)
  );
  // Needs BOTH the export right and read access to this very resource.
  router.get("/export", authorize(`reports:export`), authorize(`${perm}:read`), exportCsv(def.model, def.path, ctrl));
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

export const resourceRouter = Router();
for (const def of RESOURCES) {
  resourceRouter.use(`/${def.path}`, buildRouter(def));
}

export default resourceRouter;