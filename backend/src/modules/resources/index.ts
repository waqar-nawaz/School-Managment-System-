import { Router, Request, Response } from "express";
import { Op } from "sequelize";
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

  router.get("/", canRead, (req, res, next) => ctrl.list(req, res).catch(next));
  router.get("/count", canRead, (req, res, next) => ctrl.count(req, res).catch(next));

  if (def.path === "messages") {
    router.get("/recipients", authorize("messages:create"), async (req, res, next) => {
      try {
        const q = String(req.query.q ?? "").trim();
        const branchId = req.user?.branchId;
        const where: any = { isActive: true, ...(branchId != null ? { branchId } : {}) };
        if (q) where[Op.or] = [
          { firstName: { [Op.iLike]: `%${q}%` } }, { lastName: { [Op.iLike]: `%${q}%` } },
          { username: { [Op.iLike]: `%${q}%` } }, { email: { [Op.iLike]: `%${q}%` } },
        ];
        const users = await User.findAll({ where, attributes: ["id","firstName","lastName","username","email","role"], order: [["firstName","ASC"],["lastName","ASC"]], limit: 20 });
        res.status(200).json({ success: true, data: users.map((u: any) => ({
          id: Number(u.id), name: `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.username,
          username: u.username, email: u.email, role: u.role,
        })) });
      } catch (err) { next(err); }
    });
    router.get("/unread-count", authorize("messages:read"), async (req, res, next) => {
      try {
        const where: any = { recipientId: req.user?.id, isDeleted: false, readAt: null };
        if (req.user?.branchId != null) where.branchId = req.user.branchId;
        const count = await MessageRecipient.count({ where });
        res.status(200).json({ success: true, data: { count } });
      } catch (err) { next(err); }
    });
    router.get("/inbox", authorize("messages:read"), async (req, res, next) => {
      try {
        const where: any = { recipientId: req.user?.id, isDeleted: false };
        if (req.user?.branchId != null) where.branchId = req.user.branchId;
        const rows = await MessageRecipient.findAll({
          where,
          include: [{ association: "message", required: true, include: [{ association: "sender", attributes: ["id","firstName","lastName","email","role"] }] }],
          order: [["createdAt","DESC"]], limit: Math.min(Number(req.query.limit) || 50, 100),
        });
        res.status(200).json({ success: true, data: rows.map((r: any) => {
          const m = r.message; return {
            id: Number(m.id), recipientRowId: Number(r.id), subject: m.subject, body: m.body, kind: m.kind,
            senderId: Number(m.senderId), senderName: m.sender ? `${m.sender.firstName ?? ""} ${m.sender.lastName ?? ""}`.trim() : "Unknown",
            senderRole: m.sender?.role ?? "", createdAt: m.createdAt, readAt: r.readAt, isArchived: !!m.isArchived,
          };
        }) });
      } catch (err) { next(err); }
    });
    router.get("/sent", authorize("messages:read"), async (req, res, next) => {
      try {
        const where: any = { senderId: req.user?.id };
        if (req.user?.branchId != null) where.branchId = req.user.branchId;
        const rows = await Message.findAll({ where, order: [["createdAt","DESC"]], limit: Math.min(Number(req.query.limit) || 50, 100) });
        const ids = rows.map((m: any) => Number(m.id));
        const recipients = ids.length ? await MessageRecipient.findAll({ where: { messageId: ids, isDeleted: false }, attributes: ["messageId","recipientId","readAt"] }) : [];
        const readBy = new Map<number, number>();
        for (const rr of recipients) if (rr.readAt) readBy.set(Number(rr.messageId), (readBy.get(Number(rr.messageId)) ?? 0) + 1);
        res.status(200).json({ success: true, data: rows.map((m: any) => ({ ...m.toJSON(), recipientCount: recipients.filter((rr: any) => Number(rr.messageId) === Number(m.id)).length, readCount: readBy.get(Number(m.id)) ?? 0 })) });
      } catch (err) { next(err); }
    });
    router.patch("/:id/read", authorize("messages:read"), async (req, res, next) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id)) throw ApiError.badRequest("Invalid id");
        const row = await MessageRecipient.findOne({ where: { messageId: id, recipientId: req.user?.id, isDeleted: false } });
        if (!row) throw ApiError.notFound("Message not found in your inbox");
        await row.update({ readAt: new Date() });
        res.status(200).json({ success: true, message: "Message marked as read", data: row });
      } catch (err) { next(err); }
    });
  }

  if (def.path === "notifications") {
    router.get("/unread-count", authorize("notifications:read"), async (req, res, next) => {
      try {
        const where: any = { userId: req.user?.id, readAt: null };
        if (req.user?.branchId != null) where.branchId = req.user.branchId;
        const count = await Notification.count({ where });
        res.status(200).json({ success: true, data: { count } });
      } catch (err) { next(err); }
    });
    router.patch("/:id/read", authorize("notifications:update"), async (req, res, next) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id)) throw ApiError.badRequest("Invalid id");
        const where: any = { id, userId: req.user?.id };
        if (req.user?.branchId != null) where.branchId = req.user.branchId;
        const row = await Notification.findOne({ where });
        if (!row) throw ApiError.notFound("Notification not found");
        await row.update({ readAt: new Date() });
        res.status(200).json({ success: true, message: "Notification marked as read", data: row });
      } catch (err) { next(err); }
    });
  }

  // Needs BOTH the export right and read access to this very resource.
  router.get("/export", authorize(`reports:export`), authorize(`${perm}:read`), exportCsv(def.model, def.path, ctrl));
  router.get("/:id", canRead, (req, res, next) => ctrl.getOne(req, res).catch(next));

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