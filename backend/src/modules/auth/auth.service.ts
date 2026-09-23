import crypto from "crypto";
import { User, RefreshToken, Settings } from "../../models";
import { comparePassword, hashPassword } from "../../utils/password.util";
import { ApiError } from "../../utils/ApiError";
import { signAccessToken, signRefreshToken } from "../../utils/token.util";
import { sendMail } from "../../services/email.service";
import { writeAuditLog } from "../../services/audit.service";
import { permissionsForRole } from "../../config/permissions";

export interface LoginInput {
  identifier: string;
  password: string;
  rememberMe?: boolean;
}

export interface AuthResult {
  user: User;
  accessToken: string;
  refreshToken: string;
}

function toClaims(role: string): string[] {
  return permissionsForRole(role);
}

export async function login(input: LoginInput, ip?: string, userAgent?: string): Promise<AuthResult> {
  const user = await User.findOne({
    where: {
      ...(input.identifier.includes("@")
        ? { email: input.identifier }
        : { username: input.identifier }),
    },
  });

  if (!user || !(await comparePassword(input.password, user.passwordHash))) {
    await writeAuditLog({
      action: "login",
      entity: "user",
      entityId: input.identifier,
      ip,
      userAgent,
      newData: { success: false },
    });
    throw ApiError.unauthorized("Invalid credentials");
  }

  if (!user.isActive) throw ApiError.forbidden("Account is disabled. Contact the administrator.");

  const refreshToken = signRefreshToken(String(user.id));
  await RefreshToken.create({
    userId: user.id,
    tokenHash: sha256(refreshToken),
    ip: ip?.slice(0, 45),
    userAgent: (userAgent ?? "").slice(0, 255),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });

  await user.update({
    lastLoginAt: new Date(),
    lastLoginIp: ip?.slice(0, 45),
  });

  await writeAuditLog({
    action: "login",
    entity: "user",
    entityId: user.id,
    ip,
    userAgent,
    role: user.role,
    newData: { success: true },
  });

  return {
    user,
    accessToken: signAccessToken(String(user.id), user.role, toClaims(user.role), user.branchId),
    refreshToken,
  };
}

export async function refresh(refreshToken: string, ip?: string): Promise<AuthResult> {
  const hash = sha256(refreshToken);
  const stored = await RefreshToken.findOne({ where: { tokenHash: hash } });
  if (!stored || stored.revoked || stored.expiresAt < new Date()) {
    throw ApiError.unauthorized("Invalid refresh token");
  }

  const user = await User.findByPk(stored.userId);
  if (!user || !user.isActive) throw ApiError.unauthorized("User no longer active");

  const newToken = signRefreshToken(String(user.id));
  await stored.update({ revoked: true, revokedAt: new Date() });
  await RefreshToken.create({
    userId: user.id,
    tokenHash: sha256(newToken),
    ip: ip?.slice(0, 45),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });

  return {
    user,
    accessToken: signAccessToken(String(user.id), user.role, toClaims(user.role), user.branchId),
    refreshToken: newToken,
  };
}

export async function logout(refreshToken: string): Promise<void> {
  const hash = sha256(refreshToken);
  await RefreshToken.update(
    { revoked: true, revokedAt: new Date() },
    { where: { tokenHash: hash, revoked: false } }
  );
}

export async function changePassword(userId: number, current: string, next: string): Promise<void> {
  const user = await User.findByPk(userId);
  if (!user) throw ApiError.unauthorized();
  if (!(await comparePassword(current, user.passwordHash))) {
    throw ApiError.badRequest("Current password is incorrect");
  }
  await user.update({
    passwordHash: await hashPassword(next),
    passwordChangedAt: new Date(),
  });
}

export async function forgotPassword(
  email: string,
  baseUrl: string
): Promise<{ resetUrl: string; mailed: boolean }> {
  const user = await User.findOne({ where: { email } });
  if (!user) throw ApiError.notFound("No account found for that email");

  const token = crypto.randomBytes(32).toString("hex");
  const hashed = crypto.createHash("sha256").update(token).digest("hex");
  // Store reset token in settings scoped to the user (rotation-safe, short lived).
  const expiresAt = Date.now() + 30 * 60 * 1000;
  await Settings.upsert({
    scope: `reset:${user.id}`,
    key: hashed,
    value: String(expiresAt),
    description: "password-reset token",
  });

  const resetUrl = `${baseUrl.replace(/\/+$/, "")}/auth/reset-password?token=${token}`;
  const mailed = await sendMail({
    to: user.email,
    subject: "Password reset request",
    html: `<p>Hi ${user.firstName},</p><p>Reset your password here (valid 30 min):</p><p><a href="${resetUrl}">${resetUrl}</a></p>`,
  });
  return { resetUrl, mailed };
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const hashed = crypto.createHash("sha256").update(token).digest("hex");
  const row = await Settings.findOne({ where: { key: hashed } });
  if (!row || !row.scope.startsWith("reset:")) throw ApiError.badRequest("Invalid or expired token");

  const expiresAt = Number(row.value);
  if (Date.now() > expiresAt) {
    await row.destroy();
    throw ApiError.badRequest("Reset token expired");
  }

  const userId = Number(row.scope.split(":")[1]);
  const user = await User.findByPk(userId);
  if (!user) throw ApiError.badRequest("User not found");

  await user.update({ passwordHash: await hashPassword(newPassword), passwordChangedAt: new Date() });
  await row.destroy();
}

export async function verifyEmail(token: string): Promise<void> {
  const hashed = crypto.createHash("sha256").update(token).digest("hex");
  const row = await Settings.findOne({ where: { key: hashed } });
  if (!row || !row.scope.startsWith("verify:")) throw ApiError.badRequest("Invalid verification token");

  const userId = Number(row.scope.split(":")[1]);
  await User.update({ emailVerified: true }, { where: { id: userId } });
  await row.destroy();
}

export function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}