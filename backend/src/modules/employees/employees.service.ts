import { Op, Transaction } from "sequelize";
import { sequelize } from "../../database/sequelize";
import { logger } from "../../config/logger";
import { User, Staff, Teacher, Settings, Hostel } from "../../models";

/** Roles that are school employees. Each gets one Staff row (and teachers also a Teacher row). */
export const EMPLOYEE_ROLES = new Set([
  "teacher", "staff", "hostel_warden", "accountant", "librarian", "transport_manager", "receptionist", "principal",
]);

const ROLE_LABEL: Record<string, string> = {
  teacher: "Teacher", staff: "Staff", hostel_warden: "Hostel Warden", accountant: "Accountant", librarian: "Librarian",
  transport_manager: "Transport Manager", receptionist: "Receptionist", principal: "Principal",
};
export const roleLabel = (role: string): string => ROLE_LABEL[role] ?? role.replace(/_/g, " ");

/**
 * EMP-0001, EMP-0002 ... unique per branch. A transaction-level advisory lock makes two people
 * created at the same moment get different numbers (the old Date.now() based codes were unreadable).
 */
export async function nextStaffNo(branchId: number | null, t: Transaction): Promise<string> {
  await sequelize.query("SELECT pg_advisory_xact_lock(727102)", { transaction: t });
  const where: any = { staffNo: { [Op.like]: "EMP-%" }, ...(branchId != null ? { branchId } : {}) };
  const [lastStaff, lastTeacher] = await Promise.all([
    Staff.findOne({ where, order: [["staffNo", "DESC"]], attributes: ["staffNo"], transaction: t }),
    Teacher.findOne({ where, order: [["staffNo", "DESC"]], attributes: ["staffNo"], transaction: t }),
  ]);
  const n = (v?: string | null) => parseInt(String(v ?? "").slice(4), 10) || 0;
  const next = Math.max(n(lastStaff?.staffNo), n(lastTeacher?.staffNo)) + 1;
  return `EMP-${String(next).padStart(4, "0")}`;
}

/**
 * Make sure an employee user has the profile rows they need and that those rows agree with the
 * login (type, name, contact, active flag). Idempotent; safe after create, role change or edit.
 */
export async function ensureEmployeeProfiles(user: User, t?: Transaction, extra: Partial<Staff> = {}): Promise<void> {
  const isEmployee = EMPLOYEE_ROLES.has(user.role);
  const staff = await Staff.findOne({ where: { userId: user.id }, transaction: t });
  const teacher = await Teacher.findOne({ where: { userId: user.id }, transaction: t });

  if (!isEmployee) {
    // Moved to a non-employee role (parent, student...): keep the history but stop paying/listing them.
    if (staff && staff.isActive) await staff.update({ isActive: false }, { transaction: t });
    if (teacher && teacher.isActive) await teacher.update({ isActive: false }, { transaction: t });
    if (staff) await releaseWardenPost(staff.id, t);
    return;
  }

  const shared = {
    firstName: user.firstName, lastName: user.lastName, email: user.email, phone: user.phone ?? null,
    isActive: user.isActive !== false,
  };

  if (!staff) {
    const staffNo = teacher?.staffNo ?? (await nextStaffNo(user.branchId ?? null, t as Transaction));
    await Staff.create({
      ...shared, staffNo, branchId: user.branchId ?? null, userId: user.id, employeeType: user.role,
      gender: (user.gender as any) ?? undefined, designation: roleLabel(user.role), hireDate: new Date(), ...extra,
    } as any, { transaction: t });
  } else {
    await staff.update({ ...shared, employeeType: user.role, ...(user.gender ? { gender: user.gender as any } : {}) }, { transaction: t });
    // Only an active hostel warden can be in charge of a hostel.
    if (!shared.isActive || user.role !== "hostel_warden") await releaseWardenPost(staff.id, t);
  }

  if (user.role === "teacher") {
    if (!teacher) {
      const staffNo = (await Staff.findOne({ where: { userId: user.id }, attributes: ["staffNo"], transaction: t }))!.staffNo;
      await Teacher.create({
        ...shared, staffNo, branchId: user.branchId ?? null, userId: user.id, gender: (user.gender as any) ?? undefined, hireDate: new Date(),
      } as any, { transaction: t });
    } else {
      await teacher.update({ ...shared, ...(user.gender ? { gender: user.gender as any } : {}) }, { transaction: t });
    }
  } else if (teacher && teacher.isActive) {
    // No longer a teacher: remove them from timetables/teacher lists but keep the record.
    await teacher.update({ isActive: false }, { transaction: t });
  }
}

/** A hostel must not keep pointing at someone who left or changed jobs. */
export async function releaseWardenPost(staffId: number, t?: Transaction): Promise<void> {
  await Hostel.update({ wardenId: null } as any, { where: { wardenId: staffId }, transaction: t });
}

/** The other direction: editing the employee's profile updates the login's name/contact. */
export async function syncUserFromProfile(profile: { userId?: number | null; firstName?: string; lastName?: string; phone?: string | null; email?: string | null }, t?: Transaction): Promise<void> {
  if (!profile.userId) return;
  const user = await User.findByPk(profile.userId, { transaction: t });
  if (!user) return;
  const patch: Record<string, unknown> = {};
  if (profile.firstName && profile.firstName !== user.firstName) patch.firstName = profile.firstName;
  if (profile.lastName !== undefined && profile.lastName !== user.lastName) patch.lastName = profile.lastName ?? "";
  if (profile.phone !== undefined && profile.phone !== user.phone) patch.phone = profile.phone;
  if (profile.email && profile.email.toLowerCase() !== user.email.toLowerCase()) patch.email = profile.email.toLowerCase();
  if (Object.keys(patch).length) {
    await user.update(patch, { transaction: t });
    await ensureEmployeeProfiles(user, t); // keep the Teacher/Staff twins identical
  }
}

/**
 * One-time catch-up for people who were created before every employee got a Staff row (existing
 * staff numbers are left alone). Runs once (marker in settings) so a deliberately deleted profile
 * is never silently recreated on later boots.
 */
export async function backfillEmployeeProfiles(): Promise<void> {
  try {
    const marker = await Settings.findOne({ where: { scope: "system", key: "employeeProfilesBackfilled" } });
    if (marker?.value === "true") return;
    const users = await User.findAll({ where: { role: { [Op.in]: Array.from(EMPLOYEE_ROLES) }, isActive: true }, order: [["id", "ASC"]] });
    let created = 0;
    await sequelize.transaction(async (t) => {
      for (const u of users) {
        const had = await Staff.count({ where: { userId: u.id }, transaction: t });
        await ensureEmployeeProfiles(u, t);
        if (!had) created++;
      }
    });
    await Settings.upsert({ scope: "system", key: "employeeProfilesBackfilled", value: "true", description: "employee profiles backfilled" } as any);
    if (created) logger.info(`Employees: created ${created} missing staff profile(s) for existing users`);
  } catch (err) {
    logger.warn(`Employee backfill skipped: ${(err as Error).message}`);
  }
}
