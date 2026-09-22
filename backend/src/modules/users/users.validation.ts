import { z } from "zod";
import { USER_ROLES } from "../../utils/constants";

const roleEnum = z.enum(USER_ROLES as unknown as [string, ...string[]]);

export const createUserSchema = z.object({
  username: z.string().min(3).max(120),
  email: z.string().email(),
  firstName: z.string().min(1).max(120),
  lastName: z.string().min(1).max(120),
  password: z.string().min(8).optional(),
  role: roleEnum,
  gender: z.enum(["male", "female", "other"]).optional(),
  phone: z.string().max(20).optional(),
  branchId: z.number().int().positive().optional(),
  sendWelcome: z.boolean().default(true),
});

// Accepts numbers, numeric strings, "" and null (BIGINT ids often arrive as strings).
const nullableId = z.preprocess(
  (v) => {
    if (v === "" || v === null || v === undefined) return null;
    return typeof v === "string" ? Number(v) : v;
  },
  z.number().int().positive().nullable()
);

export const updateUserSchema = z.object({
  firstName: z.string().min(1).max(120).optional(),
  lastName: z.string().min(1).max(120).optional(),
  username: z.string().min(3).max(120).optional(),
  phone: z.string().max(20).nullish(),
  email: z.string().email().optional(),
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