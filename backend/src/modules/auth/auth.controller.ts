import { Request, Response } from "express";
import asyncHandler from "../../utils/asyncHandler";
import { ApiResponse } from "../../utils/ApiResponse";
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

function resolveBaseUrl(req: Request): string {
  const configured = process.env.FRONTEND_URL || "";
  if (configured && !configured.includes("localhost")) return configured;
  return `${req.protocol}://${req.get("host")}`;
}

export const forgotPassword = asyncHandler(async (req: Request, res: Response) => {
  const { resetUrl, mailed } = await authService.forgotPassword(
    req.body.email,
    resolveBaseUrl(req)
  );
  // When SMTP isn't configured and EXPOSE_RESET_LINK=true, hand the link back
  // so it can still be used (handy for demos / first setup).
  const expose = !mailed && process.env.EXPOSE_RESET_LINK === "true";
  ApiResponse.success(
    res,
    200,
    "If that email exists, a reset link has been sent",
    expose ? { resetUrl } : null
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
  if (!user) throw new (await import("../../utils/ApiError")).ApiError(404, "User not found");
  ApiResponse.success(res, 200, "Profile", sanitize(user));
});

export function sanitize(user: User): Partial<User> {
  const { passwordHash, ...rest } = user.toJSON() as User & { passwordHash: string };
  void passwordHash;
  return rest;
}