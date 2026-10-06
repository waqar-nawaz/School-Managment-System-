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
      const rawRecipientIds = Array.isArray(body.recipientIds)
        ? body.recipientIds
        : typeof body.recipientIds === "string"
          ? body.recipientIds.split(",").map((value: string) => value.trim()).filter(Boolean)
          : [];
      const recipientIds: number[] = Array.from(new Set(
        rawRecipientIds
          .map((n: any) => Number(n))
          .filter((n: number) => Number.isInteger(n) && n > 0)
      ));
      if (kind !== "broadcast" && recipientIds.length === 0) {
        throw ApiError.badRequest("recipientIds is required for direct/group messages");
      }

      if (recipientIds.length) {
        const recipients = await User.findAll({
          where: {
            id: { [Op.in]: recipientIds },
            isActive: true,
            ...(branchId != null ? { branchId } : {}),
          },
          attributes: ["id"],
        });
        const validRecipientIds = new Set(recipients.map((user) => Number(user.id)));
        const invalidRecipientIds = recipientIds.filter((id) => !validRecipientIds.has(id));
        if (invalidRecipientIds.length) {
          throw ApiError.badRequest("One or more recipients are inactive, missing, or outside your branch");
        }
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
      if (req.user?.role !== "super_admin" && Number(current.senderId) !== Number(req.user?.id)) {
        throw ApiError.forbidden("Only the message sender can edit this message");
      }
      delete body.senderId;
      delete body.recipientIds;
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
        const recipients = await User.findAll({
          where: {
            id: { [Op.in]: recipientIds },
            isActive: true,
            ...(row.branchId != null ? { branchId: row.branchId } : {}),
          },
          attributes: ["id"],
        });
        const validRecipientIds = new Set(recipients.map((user) => Number(user.id)));
        recipientIds = recipientIds.filter((id) => validRecipientIds.has(id));
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
    beforeCreate: (body, req) => {
      const title = String(body.title ?? "").trim();
      const category = String(body.category ?? "general").trim().toLowerCase();
      const startAt = new Date(body.startAt);
      const endAt = body.endAt ? new Date(body.endAt) : null;
      if (!title) throw ApiError.badRequest("Event title is required");
      if (!["general", "sports", "cultural", "exam", "holiday"].includes(category)) throw ApiError.badRequest("Invalid event category");
      if (!Number.isFinite(startAt.getTime())) throw ApiError.badRequest("Invalid event start date");
      if (endAt && !Number.isFinite(endAt.getTime())) throw ApiError.badRequest("Invalid event end date");
      if (endAt && endAt.getTime() < startAt.getTime()) throw ApiError.badRequest("Event end cannot be before start");
      body.title = title; body.category = category; body.startAt = startAt; body.endAt = endAt ?? undefined;
      body.createdBy = req.user?.id; body.branchId = req.user?.branchId ?? body.branchId;
      return body;
    },
    beforeUpdate: async (body, req) => {
      const current = await Event.findByPk(req.params.id);
      if (!current) throw ApiError.notFound("Event not found");
      const title = String(body.title ?? current.title).trim();
      const category = String(body.category ?? current.category).trim().toLowerCase();
      const startAt = body.startAt !== undefined ? new Date(body.startAt) : new Date(current.startAt);
      const endAt = body.endAt !== undefined && body.endAt !== null && body.endAt !== "" ? new Date(body.endAt) : (body.endAt === null || body.endAt === "" ? null : (current.endAt ? new Date(current.endAt) : null));
      if (!title) throw ApiError.badRequest("Event title is required");
      if (!["general", "sports", "cultural", "exam", "holiday"].includes(category)) throw ApiError.badRequest("Invalid event category");
      if (!Number.isFinite(startAt.getTime())) throw ApiError.badRequest("Invalid event start date");
      if (endAt && !Number.isFinite(endAt.getTime())) throw ApiError.badRequest("Invalid event end date");
      if (endAt && endAt.getTime() < startAt.getTime()) throw ApiError.badRequest("Event end cannot be before start");
      delete body.createdBy; delete body.branchId;
      body.title = title; body.category = category; body.startAt = startAt; body.endAt = endAt;
      return body;
    },
  },
  {
    path: "notices", model: Notice, searchable: ["title", "type"], permission: "notices",
    beforeCreate: (body, req) => {
      const title = String(body.title ?? "").trim();
      const bodyText = String(body.body ?? "").trim();
      const type = String(body.type ?? "notice").trim().toLowerCase();
      const publishDate = body.publishDate ? new Date(body.publishDate) : new Date();
      const expiryDate = body.expiryDate ? new Date(body.expiryDate) : null;
      if (!title || !bodyText) throw ApiError.badRequest("Notice title and body are required");
      if (!["notice", "circular", "urgent"].includes(type)) throw ApiError.badRequest("Invalid notice type");
      if (!Number.isFinite(publishDate.getTime())) throw ApiError.badRequest("Invalid notice publish date");
      if (expiryDate && !Number.isFinite(expiryDate.getTime())) throw ApiError.badRequest("Invalid notice expiry date");
      if (expiryDate && expiryDate.getTime() < publishDate.getTime()) throw ApiError.badRequest("Notice expiry cannot be before publish date");
      body.title = title; body.body = bodyText; body.type = type; body.publishDate = publishDate; body.expiryDate = expiryDate ?? undefined;
      body.createdBy = req.user?.id; body.branchId = req.user?.branchId ?? body.branchId;
      return body;
    },
    beforeUpdate: async (body, req) => {
      const current = await Notice.findByPk(req.params.id);
      if (!current) throw ApiError.notFound("Notice not found");
      const title = String(body.title ?? current.title).trim();
      const bodyText = String(body.body ?? current.body).trim();
      const type = String(body.type ?? current.type).trim().toLowerCase();
      const publishDate = body.publishDate !== undefined ? new Date(body.publishDate) : new Date(current.publishDate ?? new Date());
      const expiryDate = body.expiryDate !== undefined && body.expiryDate !== null && body.expiryDate !== "" ? new Date(body.expiryDate) : (body.expiryDate === null || body.expiryDate === "" ? null : (current.expiryDate ? new Date(current.expiryDate) : null));
      if (!title || !bodyText) throw ApiError.badRequest("Notice title and body are required");
      if (!["notice", "circular", "urgent"].includes(type)) throw ApiError.badRequest("Invalid notice type");
      if (!Number.isFinite(publishDate.getTime())) throw ApiError.badRequest("Invalid notice publish date");
      if (expiryDate && !Number.isFinite(expiryDate.getTime())) throw ApiError.badRequest("Invalid notice expiry date");
      if (expiryDate && expiryDate.getTime() < publishDate.getTime()) throw ApiError.badRequest("Notice expiry cannot be before publish date");
      delete body.createdBy; delete body.branchId;
      body.title = title; body.body = bodyText; body.type = type; body.publishDate = publishDate; body.expiryDate = expiryDate;
      return body;
    },
  },
  {
    path: "announcements", model: Announcement, searchable: ["title", "priority"], permission: "announcements",
    beforeCreate: (body, req) => {
      const title = String(body.title ?? "").trim();
      const bodyText = String(body.body ?? "").trim();
      const priority = String(body.priority ?? "info").trim().toLowerCase();
      const startsAt = new Date(body.startsAt);
      const endsAt = body.endsAt ? new Date(body.endsAt) : null;
      if (!title || !bodyText) throw ApiError.badRequest("Announcement title and body are required");
      if (!["info", "important", "critical"].includes(priority)) throw ApiError.badRequest("Invalid announcement priority");
      if (!Number.isFinite(startsAt.getTime())) throw ApiError.badRequest("Invalid announcement start date");
      if (endsAt && !Number.isFinite(endsAt.getTime())) throw ApiError.badRequest("Invalid announcement end date");
      if (endsAt && endsAt.getTime() < startsAt.getTime()) throw ApiError.badRequest("Announcement end cannot be before start");
      body.title = title; body.body = bodyText; body.priority = priority; body.startsAt = startsAt; body.endsAt = endsAt ?? undefined;
      body.createdBy = req.user?.id; body.branchId = req.user?.branchId ?? body.branchId;
      return body;
    },
    beforeUpdate: async (body, req) => {
      const current = await Announcement.findByPk(req.params.id);
      if (!current) throw ApiError.notFound("Announcement not found");
      const title = String(body.title ?? current.title).trim();
      const bodyText = String(body.body ?? current.body).trim();
      const priority = String(body.priority ?? current.priority).trim().toLowerCase();
      const startsAt = body.startsAt !== undefined ? new Date(body.startsAt) : new Date(current.startsAt);
      const endsAt = body.endsAt !== undefined && body.endsAt !== null && body.endsAt !== "" ? new Date(body.endsAt) : (body.endsAt === null || body.endsAt === "" ? null : (current.endsAt ? new Date(current.endsAt) : null));
      if (!title || !bodyText) throw ApiError.badRequest("Announcement title and body are required");
      if (!["info", "important", "critical"].includes(priority)) throw ApiError.badRequest("Invalid announcement priority");
      if (!Number.isFinite(startsAt.getTime())) throw ApiError.badRequest("Invalid announcement start date");
      if (endsAt && !Number.isFinite(endsAt.getTime())) throw ApiError.badRequest("Invalid announcement end date");
      if (endsAt && endsAt.getTime() < startsAt.getTime()) throw ApiError.badRequest("Announcement end cannot be before start");
      delete body.createdBy; delete body.branchId;
      body.title = title; body.body = bodyText; body.priority = priority; body.startsAt = startsAt; body.endsAt = endsAt;
      return body;
    },
  },
];
