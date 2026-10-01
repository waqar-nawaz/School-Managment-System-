import { NextFunction, Response } from "express";
import jwt from "jsonwebtoken";
import env from "../config";
import { ApiError } from "../utils/ApiError";
import asyncHandler from "../utils/asyncHandler";
import { User } from "../models";

export interface JwtAccessPayload {
  sub: string;
  role: string;
  claims: string[];
  branchId?: number | null;
}

// Short-lived cache so we don't hit the DB on every request.
// Stale entries are tolerated for up to 60s — deactivated users' tokens die within a minute.
interface CachedActiveCheck {
  active: boolean;
  expiresAt: number;
}
const activeCache = new Map<number, CachedActiveCheck>();
const CACHE_TTL_MS = 60_000;

/** Drop the cached active flag so (de)activation takes effect on the very next request. */
export function invalidateActiveCache(userId: number): void {
  activeCache.delete(userId);
}

async function isUserActive(userId: number): Promise<boolean> {
  const now = Date.now();
  const cached = activeCache.get(userId);
  if (cached && cached.expiresAt > now) return cached.active;
  const user = await User.findByPk(userId, { attributes: ["id", "isActive"] });
  const active = Boolean(user?.isActive);
  activeCache.set(userId, { active, expiresAt: now + CACHE_TTL_MS });
  return active;
}

export const authenticate = asyncHandler(
  async (req, _res: Response, next: NextFunction) => {
    const header = req.headers.authorization || "";
    if (!header.startsWith("Bearer ")) {
      throw ApiError.unauthorized("Missing bearer token");
    }

    const token = header.slice(7).trim();
    let decoded: JwtAccessPayload;
    try {
      decoded = jwt.verify(token, env.jwt.secret) as JwtAccessPayload;
    } catch {
      throw ApiError.unauthorized("Invalid or expired token");
    }

    const userId = parseInt(decoded.sub, 10);
    req.user = {
      id: userId,
      role: decoded.role,
      claims: decoded.claims || [],
      branchId: decoded.branchId ?? null,
    };

    // Verify the user is still active. Without this, a deactivated user's existing JWT
    // continues to work until the access-token expires (up to 15 minutes).
    if (!(await isUserActive(userId))) {
      throw ApiError.forbidden("Account is disabled. Contact the administrator.");
    }

    next();
  }
);