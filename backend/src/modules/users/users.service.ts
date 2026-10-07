import { User, Parent, Role } from "../../models";
import { Transaction, Op } from "sequelize";
import { sequelize } from "../../database/sequelize";
import { hashPassword, generateRandomPassword } from "../../utils/password.util";
import { ApiError } from "../../utils/ApiError";
import { sendWelcomeEmail } from "../../services/email.service";
import { writeAuditLog } from "../../services/audit.service";
import { ensureEmployeeProfiles } from "../employees/employees.service";

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

  // 1. Parent profile (for parent role only)
  if (user.role === "parent") {
    const exists = await Parent.findOne({ where: { userId: user.id }, transaction });
    if (!exists) {
      await Parent.create({
        fullName: fullName || "Guardian", phone: user.phone ?? null, email: user.email,
        branchId: user.branchId ?? null, relation: "guardian", userId: user.id,
      } as any, { transaction });
    }
  }

  // 2. Employee profiles: every employee role gets a Staff row (teachers also a Teacher row), kept in
  //    step with the login (type, name, contact, active). See employees.service.ts.
  await ensureEmployeeProfiles(user, transaction);
}

/** Case-insensitive "is this username / email already taken (by someone else)?" */
export async function assertIdentityFree(identity: { username?: string; email?: string }, exceptUserId?: number, transaction?: Transaction): Promise<void> {
  const notSelf = exceptUserId ? { id: { [Op.ne]: exceptUserId } } : {};
  if (identity.email !== undefined) {
    const hit = await User.findOne({ where: { [Op.and]: [sequelize.where(sequelize.fn("lower", sequelize.col("email")), identity.email.toLowerCase()), notSelf] }, transaction });
    if (hit) throw ApiError.conflict("Email already registered");
  }
  if (identity.username !== undefined) {
    const hit = await User.findOne({ where: { [Op.and]: [sequelize.where(sequelize.fn("lower", sequelize.col("username")), identity.username.toLowerCase()), notSelf] }, transaction });
    if (hit) throw ApiError.conflict("Username already taken");
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

  input.email = String(input.email).trim().toLowerCase();
  await assertIdentityFree({ email: input.email, username: input.username }, undefined, t);

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