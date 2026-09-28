import { User, Parent, Teacher, Staff } from "../../models";
import { Transaction } from "sequelize";
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

export async function createUser(input: CreateUserInput): Promise<User> {
  const emailTaken = await User.findOne({ where: { email: input.email }, transaction: input.transaction });
  if (emailTaken) throw ApiError.conflict("Email already registered");

  const usernameTaken = await User.findOne({ where: { username: input.username }, transaction: input.transaction });
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
  }, { transaction: input.transaction });

  // Auto-create the linked profile record so role-scoped lookups (Parent.findOne, etc.) work.
  // Without this, the parent/teacher/staff portal flow breaks immediately because the role-specific
  // record is required by assertStudentAccess and other helpers.
  if (input.role === "parent") {
    await Parent.create({
      fullName: `${input.firstName} ${input.lastName}`.trim() || "Guardian",
      phone: input.phone ?? null,
      email: input.email,
      branchId: input.branchId ?? null,
      relation: "guardian",
      userId: user.id,
    }, { transaction: input.transaction });
  } else if (input.role === "teacher") {
    await Teacher.create({
      staffNo: `TCH-${Date.now().toString(36).toUpperCase()}`,
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      phone: input.phone ?? null,
      branchId: input.branchId ?? null,
      isActive: true,
      userId: user.id,
    }, { transaction: input.transaction });
  } else if (input.role === "staff") {
    await Staff.create({
      staffNo: `STF-${Date.now().toString(36).toUpperCase()}`,
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      phone: input.phone ?? null,
      branchId: input.branchId ?? null,
      isActive: true,
      userId: user.id,
    }, { transaction: input.transaction });
  }

  if (input.sendWelcome) {
    await sendWelcomeEmail(input.email, `${input.firstName} ${input.lastName}`, tempPassword).catch(() => {});
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