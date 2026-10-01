import { User, Parent, Teacher, Staff, Role } from "../../models";
import { Transaction } from "sequelize";
import { sequelize } from "../../database/sequelize";
import { hashPassword, generateRandomPassword } from "../../utils/password.util";
import { ApiError } from "../../utils/ApiError";
import { sendWelcomeEmail } from "../../services/email.service";
import { writeAuditLog } from "../../services/audit.service";

export interface CreateUserInput {
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  password?: string;
  role: string;
  gender?: string;
  phone?: string;
  branchId?: number;
  sendWelcome?: boolean;
  generatedBy?: number | null;
  transaction?: Transaction;
}

/**
 * Make sure a user has the role-specific profile row (parent / teacher / staff).
 * Idempotent: safe to call again after a role change or from any flow that creates users.
 */
export async function ensureRoleProfile(user: User, transaction?: Transaction): Promise<void> {
  const fullName = `${user.firstName} ${user.lastName}`.trim();
  if (user.role === "parent") {
    const exists = await Parent.findOne({ where: { userId: user.id }, transaction });
    if (!exists) {
      await Parent.create({
        fullName: fullName || "Guardian", phone: user.phone ?? null, email: user.email,
        branchId: user.branchId ?? null, relation: "guardian", userId: user.id,
      } as any, { transaction });
    }
  } else if (user.role === "teacher") {
    const exists = await Teacher.findOne({ where: { userId: user.id }, transaction });
    if (!exists) {
      await Teacher.create({
        staffNo: `TCH-${Date.now().toString(36).toUpperCase()}${user.id}`,
        firstName: user.firstName, lastName: user.lastName, email: user.email,
        phone: user.phone ?? null, branchId: user.branchId ?? null, isActive: true, userId: user.id,
      } as any, { transaction });
    }
  } else if (user.role === "staff") {
    const exists = await Staff.findOne({ where: { userId: user.id }, transaction });
    if (!exists) {
      await Staff.create({
        staffNo: `STF-${Date.now().toString(36).toUpperCase()}${user.id}`,
        firstName: user.firstName, lastName: user.lastName, email: user.email,
        phone: user.phone ?? null, branchId: user.branchId ?? null, isActive: true, userId: user.id,
      } as any, { transaction });
    }
  }
}

export async function createUser(input: CreateUserInput): Promise<User> {
  // Run user + profile creation atomically: no half-created users if the profile insert fails.
  if (!input.transaction) {
    return sequelize.transaction((t) => createUser({ ...input, transaction: t }));
  }
  const t = input.transaction;

  const roleRow = await Role.findOne({ where: { name: input.role }, transaction: t });
  if (!roleRow) throw ApiError.badRequest(`Unknown role "${input.role}"`);

  const emailTaken = await User.findOne({ where: { email: input.email }, transaction: t });
  if (emailTaken) throw ApiError.conflict("Email already registered");

  const usernameTaken = await User.findOne({ where: { username: input.username }, transaction: t });
  if (usernameTaken) throw ApiError.conflict("Username already taken");

  const tempPassword = input.password ?? generateRandomPassword();
  const user = await User.create({
    username: input.username,
    email: input.email,
    firstName: input.firstName,
    lastName: input.lastName,
    role: input.role,
    gender: input.gender,
    phone: input.phone,
    branchId: input.branchId ?? null,
    passwordHash: await hashPassword(tempPassword),
    passwordChangedAt: new Date(),
  }, { transaction: t });

  // Auto-create the linked profile record so role-scoped lookups (Parent.findOne, etc.) work.
  await ensureRoleProfile(user, t);

  if (input.sendWelcome) {
    sendWelcomeEmail(input.email, `${input.firstName} ${input.lastName}`, tempPassword).catch(() => {});
  }

  await writeAuditLog({
    action: "create",
    entity: "user",
    entityId: user.id,
    userId: input.generatedBy,
    role: user.role,
    newData: { email: user.email, role: user.role },
  });

  return user;
}

export async function adminResetPassword(
  userId: number,
  newPassword: string,
  adminId?: number
): Promise<void> {
  const user = await User.findByPk(userId);
  if (!user) throw ApiError.notFound("User not found");
  await user.update({ passwordHash: await hashPassword(newPassword), passwordChangedAt: new Date() });
  await writeAuditLog({
    action: "update",
    entity: "user",
    entityId: userId,
    userId: adminId,
    newData: { passwordReset: true },
  });
}