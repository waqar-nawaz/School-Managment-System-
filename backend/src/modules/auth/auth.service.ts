import crypto from "crypto";
import { Op } from "sequelize";
import { User, RefreshToken, Settings } from "../../models";
import { comparePassword, hashPassword } from "../../utils/password.util";
import { ApiError } from "../../utils/ApiError";
import { signAccessToken, signRefreshToken } from "../../utils/token.util";
import { sendMail } from "../../services/email.service";
import { writeAuditLog } from "../../services/audit.service";
import { permissionsForRole } from "../../config/permissions";
import env from "../../config";

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
    expiresAt: new Date(Date.now() + parseDurationMs(env.jwt.refreshExpiresIn)),
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
    branchId: user.branchId,
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
  // Atomic conditional update: only succeeds if the token is still valid and not revoked.
  // This eliminates the race condition where two concurrent refresh requests both pass the
  // "revoked" check and both issue new tokens.
  const [updated] = await RefreshToken.update(
    { revoked: true, revokedAt: new Date() },
    {
      where: {
        tokenHash: hash,
        revoked: false,
        expiresAt: { [Op.gt]: new Date() },
      },
    }
  );
  if (updated !== 1) {
    // Possible token reuse detected — invalidate all of the user's tokens for safety.
    const leaked = await RefreshToken.findOne({ where: { tokenHash: hash } });
    if (leaked) {
      await RefreshToken.update(
        { revoked: true, revokedAt: new Date() },
        { where: { userId: leaked.userId, revoked: false } }
      );
    }
    throw ApiError.unauthorized("Invalid refresh token");
  }

  const stored = await RefreshToken.findOne({ where: { tokenHash: hash } });
  if (!stored) throw ApiError.unauthorized("Invalid refresh token");

  const user = await User.findByPk(stored.userId);
  if (!user || !user.isActive) throw ApiError.unauthorized("User no longer active");

  const newToken = signRefreshToken(String(user.id));
  await RefreshToken.create({
    userId: user.id,
    tokenHash: sha256(newToken),
    ip: ip?.slice(0, 45),
    expiresAt: new Date(Date.now() + parseDurationMs(env.jwt.refreshExpiresIn)),
  });

  await writeAuditLog({
    action: "login",
    entity: "user",
    entityId: user.id,
    ip,
    role: user.role,
    branchId: user.branchId,
    newData: { event: "refresh" },
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
  // Best-effort audit (refresh token may belong to a now-logged-out user).
  const stored = await RefreshToken.findOne({ where: { tokenHash: hash } });
  if (stored) {
    await writeAuditLog({
      action: "logout",
      entity: "user",
      entityId: stored.userId,
      role: undefined,
      newData: {},
    });
  }
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
  await RefreshToken.update(
    { revoked: true, revokedAt: new Date() },
    { where: { userId, revoked: false } }
  );
}

export async function forgotPassword(
  email: string,
  baseUrl: string
): Promise<{ resetUrl: string; mailed: boolean }> {
  const user = await User.findOne({ where: { email } });
  if (!user) return { resetUrl: "", mailed: false };

  // Invalidate any prior reset tokens for this user before issuing a new one.
  await Settings.destroy({ where: { scope: `reset:${user.id}` } });

  const token = crypto.randomBytes(32).toString("hex");
  const hashed = crypto.createHash("sha256").update(token).digest("hex");
  const expiresAt = Date.now() + 30 * 60 * 1000;
  await Settings.create({
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

  // Revoke all existing refresh tokens so attacker can't keep using stolen sessions.
  await RefreshToken.update(
    { revoked: true, revokedAt: new Date() },
    { where: { userId, revoked: false } }
  );

  await writeAuditLog({
    action: "update",
    entity: "user",
    entityId: user.id,
    role: user.role,
    branchId: user.branchId,
    newData: { event: "password_reset" },
  });
}

export async function verifyEmail(token: string): Promise<void> {
  const hashed = crypto.createHash("sha256").update(token).digest("hex");
  const row = await Settings.findOne({ where: { key: hashed } });
  if (!row || !row.scope.startsWith("verify:")) throw ApiError.badRequest("Invalid verification token");

  const userId = Number(row.scope.split(":")[1]);
  await User.update({ emailVerified: true }, { where: { id: userId } });
  await row.destroy();
}

/**
 * Generate and store an email-verification token for the given user, then email
 * the verification link. Returns true if the email was sent.
 */
export async function sendVerificationEmail(user: User, baseUrl: string): Promise<boolean> {
  if (!user.email) return false;
  // Invalidate any prior verification tokens for this user.
  await Settings.destroy({ where: { scope: `verify:${user.id}` } });
  const token = crypto.randomBytes(32).toString("hex");
  const hashed = crypto.createHash("sha256").update(token).digest("hex");
  const expiresAt = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
  await Settings.create({
    scope: `verify:${user.id}`,
    key: hashed,
    value: String(expiresAt),
    description: "email-verification token",
  });
  const verifyUrl = `${baseUrl.replace(/\/+$/, "")}/auth/verify-email?token=${token}`;
  return sendMail({
    to: user.email,
    subject: "Verify your email address",
    html: `<p>Hi ${user.firstName},</p><p>Please verify your email address by clicking the link below (valid 24 hours):</p><p><a href="${verifyUrl}">${verifyUrl}</a></p>`,
  });
}

export function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function parseDurationMs(value: string): number {
  const m = String(value || "").trim().match(/^(\d+)\s*(s|m|h|d)$/i);
  if (!m) return 7 * 24 * 60 * 60 * 1000;
  const n = Number(m[1]);
  const unit = m[2].toLowerCase();
  const factor = unit === "s" ? 1000 : unit === "m" ? 60 * 1000 : unit === "h" ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  return n * factor;
}
