import { AuditLog } from "../models";

export type AuditAction = "create" | "update" | "delete" | "login" | "logout" | "export" | "download";

export interface AuditPayload {
  action: AuditAction;
  entity: string;
  entityId?: string | number;
  ip?: string;
  userAgent?: string;
  userId?: number | null;
  role?: string;
  oldData?: Record<string, unknown>;
  newData?: Record<string, unknown>;
}

export async function writeAuditLog(payload: AuditPayload): Promise<void> {
  try {
    await AuditLog.create({
      action: payload.action,
      entity: payload.entity,
      entityId: payload.entityId != null ? String(payload.entityId) : undefined,
      ip: payload.ip?.slice(0, 45),
      userAgent: payload.userAgent?.slice(0, 255),
      userId: payload.userId ?? null,
      role: payload.role ?? null,
      oldData: payload.oldData ?? {},
      newData: payload.newData ?? {},
    });
  } catch {
    // Audit must never break the main request flow.
  }
}