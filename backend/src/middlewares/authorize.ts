import { NextFunction, Response } from "express";
import { ApiError } from "../utils/ApiError";
import asyncHandler from "../utils/asyncHandler";
import { getPermissionsForRole } from "../services/rbac.service";

/** Require ANY of the listed permissions, e.g. authorize("students:create"). */
export const authorize = (...required: string[]) =>
  asyncHandler(async (req: any, _res: Response, next: NextFunction) => {
    const user = req.user as { role: string } | undefined;
    if (!user) throw ApiError.unauthorized();

    // Read live from the role matrix (cached) instead of the token, so changes made in
    // Roles & Permissions apply immediately and can also REMOVE permissions.
    const perms = await getPermissionsForRole(user.role);
    const ok = perms.includes("*") || required.some((perm) => perms.includes(perm));
    if (!ok) throw ApiError.forbidden(`Missing permission: ${required.join(", ")}`);
    next();
  });

/** Constrain a route to any of the given roles. */
export const allowRoles =
  (...roles: string[]) =>
  (req: any, _res: Response, next: NextFunction): void => {
    const user = req.user as { role: string } | undefined;
    if (!user) return next(ApiError.unauthorized());
    if (!roles.includes(user.role)) return next(ApiError.forbidden("Role not permitted"));
    next();
  };
