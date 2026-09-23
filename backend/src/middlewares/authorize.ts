import { NextFunction, Response } from "express";
import { ApiError } from "../utils/ApiError";
import { hasPermission } from "../config/permissions";

/** Require the user to hold every listed permission, e.g. authorize("students:create"). */
export const authorize =
  (...required: string[]) =>
  (req: any, _res: Response, next: NextFunction): void => {
    const user = req.user as { role: string; claims: string[] } | undefined;
    if (!user) return next(ApiError.unauthorized());

    // Any one of the listed permissions is enough (OR semantics).
    const ok = required.some(
      (perm) =>
        user.claims.includes("*") || user.claims.includes(perm) || hasPermission(user.role, perm)
    );
    if (!ok) return next(ApiError.forbidden(`Missing permission: ${required.join(", ")}`));
    next();
  };

/** Constrain a route to any of the given roles. */
export const allowRoles =
  (...roles: string[]) =>
  (req: any, _res: Response, next: NextFunction): void => {
    const user = req.user as { role: string } | undefined;
    if (!user) return next(ApiError.unauthorized());
    if (!roles.includes(user.role)) return next(ApiError.forbidden("Role not permitted"));
    next();
  };