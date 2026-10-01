/** Messages, notifications, events, notices and announcements */
import { Request } from "express";
import { ApiError } from "../../../utils/ApiError";
import { Op } from "sequelize";
import {
  Event,
  Notice,
  Announcement,
  Message,
  Notification,
  User,
  MessageRecipient,
} from "../../../models";
import { ResourceDefinition, plain } from "./shared";

export const COMMUNICATION_RESOURCES: ResourceDefinition[] = [
  {
    path: "messages", model: Message, searchable: ["subject"], permission: "messages",
    // Restrict the list to messages the caller sent OR is a recipient of (privacy).
    // Without this, anyone with messages:read sees every direct message in their branch.
    // super_admin (no branchId) is exempt — they can audit all messages.
    scopeWhere: async (req: Request) => {
      const userId = req.user?.id;
      if (req.user?.role === "super_admin") return {}; // audit access
      // Sub-query via a separate lookup: referencing "$recipients.x$" needs a JOIN that the list
      // query never makes, which made the whole inbox fail with a SQL error.
      const rows = await MessageRecipient.findAll({ where: { recipientId: userId, isDeleted: false }, attributes: ["messageId"] });
      const ids = rows.map((r) => Number(r.messageId));
      return { [Op.or]: [{ senderId: userId }, ...(ids.length ? [{ id: { [Op.in]: ids } }] : [])] };
    },
    beforeCreate: async (body, req) => {
      const senderId = Number(req.user?.id);
      const branchId = req.user?.branchId;
      if (!senderId) throw ApiError.badRequest("Authenticated sender is required");
      const sender = await User.findByPk(senderId);
      if (!sender || !sender.isActive) throw ApiError.badRequest("Sender is not active");
      if (branchId != null && Number(sender.branchId) !== Number(branchId)) throw ApiError.badRequest("Sender does not belong to your branch");
      const kind = String(body.kind ?? "direct").trim().toLowerCase();
      if (!["direct", "broadcast", "group"].includes(kind)) throw ApiError.badRequest("Invalid message kind");
      const messageBody = String(body.body ?? "").trim();
      if (!messageBody) throw ApiError.badRequest("Message body is required");
      // Capture recipientIds before they reach model.create (which would reject unknown column).
      const recipientIds: number[] = Array.isArray(body.recipientIds)
        ? body.recipientIds.map((n: any) => Number(n)).filter((n: number) => Number.isInteger(n) && n > 0)
        : [];
      if (kind !== "broadcast" && recipientIds.length === 0) {
        throw ApiError.badRequest("recipientIds is required for direct/group messages");
      }
      body.senderId = senderId;
      body.branchId = branchId;
      body.kind = kind;
      body.body = messageBody;
      body.isGroup = kind === "group";
      delete body.recipientIds;
      // Stash on req so the resource router's create() can pick it up after model.create.
      (req as any).__messageRecipientIds = recipientIds;
      return body;
    },
    beforeUpdate: async (body, req) => {
      const current = await Message.findByPk(req.params.id);
      if (!current) throw ApiError.badRequest("Message not found");
      if (req.user?.branchId != null && Number(current.branchId) !== Number(req.user.branchId)) throw ApiError.badRequest("Message does not belong to your branch");
      delete body.senderId;
      body.branchId = current.branchId ?? req.user?.branchId;
      if (body.kind !== undefined) {
        const kind = String(body.kind).trim().toLowerCase();
        if (!["direct", "broadcast", "group"].includes(kind)) throw ApiError.badRequest("Invalid message kind");
        body.kind = kind;
        body.isGroup = kind === "group";
      }
      if (body.body !== undefined && !String(body.body).trim()) throw ApiError.badRequest("Message body is required");
      return body;
    },
    afterCreate: async (row: any, req: Request) => {
      let recipientIds: number[] = (req as any).__messageRecipientIds ?? [];
      if (row.kind === "broadcast") {
        // A broadcast goes to everyone active in the branch (it used to create no recipients,
        // so nobody ever received it).
        const users = await User.findAll({
          where: { isActive: true, ...(row.branchId != null ? { branchId: row.branchId } : {}) },
          attributes: ["id"],
        });
        recipientIds = users.map((u) => Number(u.id)).filter((id) => id !== Number(row.senderId));
      }
      recipientIds = Array.from(new Set(recipientIds)).filter((id) => id !== Number(row.senderId));
      if (recipientIds.length) {
        await MessageRecipient.bulkCreate(
          recipientIds.map((rid) => ({ messageId: row.id, recipientId: rid, branchId: row.branchId }))
        );
      }
    },
    includes: [{ association: "sender", attributes: ["id", "firstName", "lastName", "email"] }],
    decorate: (row) => {
      const p = plain(row);
      p.senderName = p.sender ? `${p.sender.firstName} ${p.sender.lastName}`.trim() : "";
      return p;
    },
  },
  {
    // Notifications are personal: everybody (admins included) only sees their own.
    path: "notifications", model: Notification, searchable: ["title"], permission: "notifications", readonly: true,
    scopeWhere: (req: Request) => ({ userId: req.user?.id }),
  },
  {
    path: "events", model: Event, searchable: ["title", "category", "venue"], permission: "events",
    beforeCreate: (body, req) => { body.createdBy = req.user?.id; body.branchId = req.user?.branchId ?? body.branchId; return body; },
  },
  {
    path: "notices", model: Notice, searchable: ["title", "type"], permission: "notices",
    beforeCreate: (body, req) => { body.createdBy = req.user?.id; body.branchId = req.user?.branchId ?? body.branchId; return body; },
  },
  {
    path: "announcements", model: Announcement, searchable: ["title", "priority"], permission: "announcements",
    beforeCreate: (body, req) => { body.createdBy = req.user?.id; body.branchId = req.user?.branchId ?? body.branchId; return body; },
  },
];
