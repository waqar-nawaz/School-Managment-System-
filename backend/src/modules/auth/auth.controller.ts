import { Request, Response } from "express";
import asyncHandler from "../../utils/asyncHandler";
import { ApiResponse } from "../../utils/ApiResponse";
import { ApiError } from "../../utils/ApiError";
import * as authService from "./auth.service";
import { User } from "../../models";

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { user, accessToken, refreshToken } = await authService.login(
    req.body,
    req.ip,
    req.get("user-agent")
  );
  ApiResponse.success(res, 200, "Logged in", {
    user: sanitize(user),
    accessToken,
    refreshToken,
  });
});

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const { user, accessToken, refreshToken } = await authService.refresh(
    req.body.refreshToken,
    req.ip
  );
  ApiResponse.success(res, 200, "Tokens refreshed", {
    user: sanitize(user),
    accessToken,
    refreshToken,
  });
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  await authService.logout(req.body.refreshToken);
  ApiResponse.success(res, 200, "Logged out", null);
});

export const changePassword = asyncHandler(async (req: Request, res: Response) => {
  await authService.changePassword(
    req.user!.id,
    req.body.currentPassword,
    req.body.newPassword
  );
  ApiResponse.success(res, 200, "Password changed", null);
});

function resolveBaseUrl(_req: Request): string {
  // Always use configured FRONTEND_URL — never trust req.host (prevents Host-header injection
  // in password-reset emails).
  const configured = process.env.FRONTEND_URL || "";
  if (configured) return configured;
  // In development only, fall back to request origin so first-time setup works.
  if (process.env.NODE_ENV !== "production") {
    return `${_req.protocol}://${_req.get("host")}`;
  }
  throw ApiError.internal("FRONTEND_URL must be configured for password reset emails");
}

export const forgotPassword = asyncHandler(async (req: Request, res: Response) => {
  const { resetUrl, mailed } = await authService.forgotPassword(
    req.body.email,
    resolveBaseUrl(req)
  );
  // Only expose the reset URL in non-production environments when SMTP is not configured.
  // In production, the reset link must go to the user's email — never the response body.
  const exposeResetLink =
    process.env.NODE_ENV !== "production" &&
    !mailed &&
    process.env.EXPOSE_RESET_LINK === "true";
  ApiResponse.success(
    res,
    200,
    "If that email exists, a reset link has been sent",
    exposeResetLink ? { resetUrl } : null
  );
});

export const resetPassword = asyncHandler(async (req: Request, res: Response) => {
  const newPassword: string = req.body.newPassword ?? req.body.password;
  await authService.resetPassword(req.body.token, newPassword);
  ApiResponse.success(res, 200, "Password has been reset", null);
});

export const verifyEmail = asyncHandler(async (req: Request, res: Response) => {
  await authService.verifyEmail(req.body.token);
  ApiResponse.success(res, 200, "Email verified", null);
});

export const me = asyncHandler(async (req: Request, res: Response) => {
  const user = await User.findByPk(req.user!.id);
  if (!user) throw ApiError.notFound("User not found");
  ApiResponse.success(res, 200, "Profile", sanitize(user));
});

// Positive projection sanitizer — only return safe fields, never the negative strip.
const SAFE_USER_FIELDS = [
  "id", "username", "email", "firstName", "lastName", "role", "branchId",
  "isActive", "emailVerified", "lastLoginAt", "lastLoginIp", "passwordChangedAt",
  "phone", "gender",
  "createdAt", "updatedAt",
] as const;

export function sanitize(user: User): Partial<User> {
  const json = user.toJSON() as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of SAFE_USER_FIELDS) {
    if (key in json) out[key] = json[key];
  }
  return out as Partial<User>;
}