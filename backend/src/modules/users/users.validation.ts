import { z } from "zod";
// Any role that exists in the roles table (built-in or custom); existence is checked in the service.
const roleEnum = z.string().regex(/^[a-z][a-z0-9_]{1,48}$/, "Invalid role");

// Usernames: letters, digits, dot, dash, underscore (no spaces); compared case-insensitively.
const usernameSchema = z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{2,49}$/, "Username must be 3-50 characters: letters, numbers, dot, dash or underscore (no spaces)");
// Emails are stored lowercase so "Bob@x.com" and "bob@x.com" can never be two accounts.
const emailSchema = z.string().trim().toLowerCase().email();

// Accepts numbers, numeric strings, "" and null (BIGINT ids often arrive as strings).
const nullableId = z.preprocess(
  (v) => {
    if (v === "" || v === null || v === undefined) return null;
    return typeof v === "string" ? Number(v) : v;
  },
  z.number().int().positive().nullable()
);

export const createUserSchema = z.object({
  username: usernameSchema,
  email: emailSchema,
  firstName: z.string().trim().min(1).max(120),
  lastName: z.string().trim().min(1).max(120),
  password: z.string().min(8).optional(),
  role: roleEnum,
  gender: z.enum(["male", "female", "other"]).nullish(),
  phone: z.string().max(20).nullish(),
  branchId: nullableId.optional(),
  sendWelcome: z.boolean().default(true),
});

export const updateUserSchema = z.object({
  firstName: z.string().min(1).max(120).optional(),
  lastName: z.string().min(1).max(120).optional(),
  username: usernameSchema.optional(),
  phone: z.string().max(20).nullish(),
  email: emailSchema.optional(),
  gender: z.enum(["male", "female", "other"]).nullish(),
  role: roleEnum.optional(),
  isActive: z.boolean().optional(),
  branchId: nullableId.optional(),
});

export const updateUserStatusSchema = z.object({
  isActive: z.boolean(),
});

export const adminResetPasswordSchema = z.object({
  newPassword: z.string().min(8),
});
