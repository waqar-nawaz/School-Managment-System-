import { z } from "zod";
import { USER_ROLES } from "../../utils/constants";

export const loginSchema = z.object({
  identifier: z.string().min(1, "Email or username is required"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  rememberMe: z.boolean().optional(),
});

export const registerSchema = z.object({
  username: z.string().min(3).max(120),
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  firstName: z.string().min(1).max(120),
  lastName: z.string().min(1).max(120),
  role: z.enum(USER_ROLES as unknown as [string, ...string[]]).default("student"),
  phone: z.string().max(20).optional(),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

export const verifyEmailSchema = z.object({
  token: z.string().min(1),
});

export const impersonateSchema = z.object({
  userId: z.number().int().positive(),
});