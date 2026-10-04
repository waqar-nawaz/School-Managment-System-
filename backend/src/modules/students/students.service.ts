import { Op, Transaction } from "sequelize";
import { sequelize } from "../../database/sequelize";
import { ApiError } from "../../utils/ApiError";
import { generateRandomPassword } from "../../utils/password.util";
import {
  Student, Parent, StudentGuardian, Enrolment, AcademicYear, User, SchoolClass, Section,
  HostelAllocation, RefreshToken,
} from "../../models";
import { createUser } from "../users/users.service";
import { syncBed } from "../hostel/hostel.service";
import { invalidateActiveCache } from "../../middlewares/authenticate";

/* ------------------------------------------------------------------ field validation */

export function cleanGender(v: unknown, required = false): string | null {
  const s = v === undefined || v === null ? "" : String(v).trim().toLowerCase();
  if (!s) {
    if (required) throw ApiError.badRequest("Gender is required (it is used for hostel and class rules)");
    return null;
  }
  if (!["male", "female", "other"].includes(s)) throw ApiError.badRequest("Gender must be male, female or other");
  return s;
}

/** Date of birth: a real past date that is not absurdly old. Accepts "YYYY-MM-DD" or ISO strings. */
export function cleanDob(v: unknown): Date | null {
  if (v === undefined || v === null || v === "") return null;
  const d = new Date(String(v));
  if (!Number.isFinite(d.getTime())) throw ApiError.badRequest("Date of birth is not a valid date");
  const now = new Date();
  if (d.getTime() > now.getTime()) throw ApiError.badRequest("Date of birth cannot be in the future");
  if (d.getUTCFullYear() < now.getUTCFullYear() - 40) throw ApiError.badRequest("Date of birth looks wrong. Please check the year");
  return d;
}

export function cleanPhone(v: unknown, label = "Phone"): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  if (!s) return null;
  if (!/^\+?[\d][\d\s\-()]{5,19}$/.test(s) || s.replace(/\D/g, "").length < 7) {
    throw ApiError.badRequest(`${label} number looks wrong. Use digits only, e.g. 0300 1234567`);
  }
  return s;
}

export function cleanEmail(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim().toLowerCase();
  if (!s) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) throw ApiError.badRequest(`"${s}" is not a valid email address`);
  return s;
}

const idOrNull = (v: unknown): number | null => {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw ApiError.badRequest("Invalid class/section selection");
  return n;
};

const norm = (s: unknown): string => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

/* ------------------------------------------------------------------ admission numbers */

/**
 * ADM-<year>-<0001...>. A transaction-level advisory lock serialises concurrent admissions, so two
 * clerks saving at the same moment can never get the same number.
 */
export async function nextAdmissionNo(t: Transaction): Promise<string> {
  await sequelize.query("SELECT pg_advisory_xact_lock(727101)", { transaction: t });
  const prefix = `ADM-${new Date().getFullYear()}-`;
  const last = await Student.findOne({
    where: { admissionNo: { [Op.like]: `${prefix}%` } }, order: [["admissionNo", "DESC"]], attributes: ["admissionNo"], transaction: t,
  });
  const n = last ? parseInt(last.admissionNo.slice(prefix.length), 10) || 0 : 0;
  return `${prefix}${String(n + 1).padStart(4, "0")}`;
}

/* ------------------------------------------------------------------ admit a student */

export interface GuardianInput {
  id?: number; fullName?: string; name?: string; relation?: string; phone?: string; email?: string;
  occupation?: string; address?: string; isPrimary?: boolean;
}

export interface AdmitInput {
  firstName: string; lastName?: string; admissionNo?: string; gender?: unknown; dateOfBirth?: unknown;
  bloodGroup?: string; religion?: string; nationality?: string; emergencyContact?: string; address?: string;
  email?: string; phone?: string; admissionDate?: unknown;
  currentClassId?: unknown; currentSectionId?: unknown; academicYearId?: unknown; rollNo?: unknown;
  medicalInfo?: unknown; guardians?: GuardianInput[]; guardianName?: string; guardianPhone?: string;
}

export interface Credential { role: "student" | "parent"; name: string; username: string; password: string }
export interface AdmitContext { branchId: number; userId: number }

const usernameFree = async (base: string, t: Transaction): Promise<string> => {
  const root = base.toLowerCase().replace(/[^a-z0-9_.-]/g, "").slice(0, 40) || "user";
  let candidate = root.length >= 3 ? root : `${root}user`;
  for (let i = 2; await User.findOne({ where: { username: candidate }, transaction: t }); i++) candidate = `${root}_${i}`;
  return candidate;
};

async function findParent(g: GuardianInput, phone: string | null, branchId: number, t: Transaction): Promise<Parent | null> {
  if (g.id) {
    const p = await Parent.findOne({ where: { id: Number(g.id), branchId }, transaction: t });
    if (!p) throw ApiError.badRequest("Selected guardian was not found in your branch");
    return p;
  }
  if (!phone) return null;
  const candidates = await Parent.findAll({ where: { phone, branchId }, transaction: t, order: [["id", "ASC"]] });
  if (!candidates.length) return null;
  const wanted = norm(g.fullName ?? g.name);
  // Siblings share the same parent; a different person who happens to share a phone number
  // (e.g. father and mother on one mobile) must not be merged into the first one.
  if (!wanted) return candidates[0];
  return candidates.find((c) => norm(c.fullName) === wanted) ?? null;
}

/**
 * The ONE place a student is created (used by Students -> Add and Admissions -> Register).
 * Must run inside a transaction. Returns the student plus the one-time login details of any
 * account that was created, so staff can hand them to the family.
 */
export async function admitStudent(input: AdmitInput, ctx: AdmitContext, t: Transaction): Promise<{ student: Student; credentials: Credential[] }> {
  const { branchId } = ctx;
  const credentials: Credential[] = [];

  const firstName = String(input.firstName ?? "").trim();
  const lastName = String(input.lastName ?? "").trim();
  if (!firstName) throw ApiError.badRequest("First name is required");
  if (firstName.length > 120 || lastName.length > 120) throw ApiError.badRequest("Student name is too long");
  const gender = cleanGender(input.gender, true);
  const dateOfBirth = cleanDob(input.dateOfBirth);
  const email = cleanEmail(input.email);
  const phone = cleanPhone(input.phone ?? input.guardianPhone, "Phone");
  const emergency = cleanPhone(input.emergencyContact, "Emergency contact");
  const classId = idOrNull(input.currentClassId);
  const sectionId = idOrNull(input.currentSectionId);
  if (sectionId && !classId) throw ApiError.badRequest("Choose the class before the section");
  const medical = input.medicalInfo && typeof input.medicalInfo === "object" && !Array.isArray(input.medicalInfo) ? input.medicalInfo : undefined;

  let admissionNo = String(input.admissionNo ?? "").trim();
  if (admissionNo) {
    if (admissionNo.length > 30) throw ApiError.badRequest("Admission number is too long (max 30)");
    if (await Student.findOne({ where: { admissionNo }, transaction: t })) throw ApiError.conflict(`Admission number ${admissionNo} already exists`);
  } else {
    admissionNo = await nextAdmissionNo(t);
  }

  // ---- class / section (the section row is locked so two admissions cannot take the last seat)
  let section: Section | null = null;
  if (classId) {
    const klass = await SchoolClass.findOne({ where: { id: classId, branchId }, transaction: t });
    if (!klass || !klass.isActive) throw ApiError.badRequest("Selected class is inactive or outside your branch");
    if (sectionId) {
      section = await Section.findOne({ where: { id: sectionId, branchId }, transaction: t, lock: t.LOCK.UPDATE });
      if (!section || !section.isActive || Number(section.classId) !== classId) {
        throw ApiError.badRequest("Selected section does not belong to the selected class");
      }
      if (Number(section.capacity) > 0) {
        const taken = await Enrolment.count({ where: { sectionId, status: "active" }, transaction: t });
        if (taken >= Number(section.capacity)) throw ApiError.badRequest(`Section ${section.name} is full (capacity ${section.capacity})`);
      }
    }
  }

  // ---- logins
  const studentPassword = generateRandomPassword();
  const username = await usernameFree(admissionNo, t);
  let loginEmail = email ?? `${admissionNo.toLowerCase().replace(/[^a-z0-9]+/g, "")}@school.local`;
  if (await User.findOne({ where: { email: loginEmail }, transaction: t })) {
    loginEmail = `${admissionNo.toLowerCase().replace(/[^a-z0-9]+/g, "")}.${Date.now().toString(36)}@school.local`;
  }
  const user = await createUser({
    username, email: loginEmail, firstName, lastName, role: "student", gender: gender ?? undefined, phone: phone ?? undefined,
    branchId, password: studentPassword, sendWelcome: false, generatedBy: ctx.userId, transaction: t,
  });
  credentials.push({ role: "student", name: `${firstName} ${lastName}`.trim(), username, password: studentPassword });

  // ---- guardians (collected first so the student row can carry the primary guardian's name/phone)
  const guardians: GuardianInput[] = Array.isArray(input.guardians) ? input.guardians.filter((g) => g && (g.id || g.fullName || g.name || g.phone)) : [];
  if (!guardians.length && (input.guardianName || input.guardianPhone)) {
    guardians.push({ fullName: input.guardianName, phone: input.guardianPhone, relation: "guardian" });
  }

  const resolved: Array<{ parent: Parent; g: GuardianInput }> = [];
  let index = 0;
  for (const g of guardians) {
    index += 1;
    const gPhone = cleanPhone(g.phone, "Guardian phone");
    const gEmail = cleanEmail(g.email);
    const gName = String(g.fullName ?? g.name ?? "").trim();
    let parent = await findParent(g, gPhone, branchId, t);
    if (!parent) {
      if (!gName && !gPhone) throw ApiError.badRequest("A guardian needs at least a name or a phone number");
      const displayName = gName || "Guardian";
      const pwd = generateRandomPassword();
      const pUsername = await usernameFree(gPhone ? `parent_${gPhone.replace(/\D/g, "")}` : `parent_${admissionNo}`, t);
      let pEmail = gEmail && !(await User.findOne({ where: { email: gEmail }, transaction: t })) ? gEmail : null;
      pEmail = pEmail ?? `${pUsername}@school.local`;
      const pUser = await createUser({
        username: pUsername, email: pEmail, firstName: displayName, lastName: "", role: "parent", phone: gPhone ?? undefined,
        branchId, password: pwd, sendWelcome: false, generatedBy: ctx.userId, transaction: t,
      });
      parent = await Parent.findOne({ where: { userId: pUser.id }, transaction: t });
      if (!parent) throw ApiError.internal("Parent profile was not created");
      await parent.update({
        fullName: displayName, phone: gPhone, email: gEmail ?? null, relation: g.relation || "guardian",
        occupation: g.occupation, address: g.address,
      } as any, { transaction: t });
      credentials.push({ role: "parent", name: displayName, username: pUsername, password: pwd });
    }
    resolved.push({ parent, g });
  }
  const primary = resolved.find((r) => r.g.isPrimary) ?? resolved[0];

  const student = await Student.create({
    admissionNo, firstName, lastName, dateOfBirth, gender,
    bloodGroup: input.bloodGroup || undefined, religion: input.religion || undefined, nationality: input.nationality || undefined,
    emergencyContact: emergency ?? undefined, address: input.address || undefined, email: email ?? undefined,
    guardianName: primary ? primary.parent.fullName : undefined, guardianPhone: primary ? (primary.parent.phone ?? undefined) : undefined,
    admissionDate: input.admissionDate ? new Date(String(input.admissionDate)) : new Date(),
    admissionStatus: "admitted", isActive: true,
    currentClassId: classId ?? undefined, currentSectionId: sectionId ?? undefined,
    medicalInfo: medical as any, userId: user.id, branchId,
  } as any, { transaction: t });

  for (const [i, r] of resolved.entries()) {
    await StudentGuardian.findOrCreate({
      where: { studentId: student.id, parentId: r.parent.id },
      defaults: {
        studentId: student.id, parentId: r.parent.id, relation: r.g.relation || r.parent.relation || "guardian",
        isPrimary: r.g.isPrimary !== undefined ? !!r.g.isPrimary : i === 0,
      } as any,
      transaction: t,
    });
  }

  // ---- enrolment
  if (classId) {
    const year = await resolveAcademicYear(input.academicYearId, branchId, input.admissionDate, t);
    const rollNo = await pickRollNo(input.rollNo, { yearId: Number(year.id), classId, sectionId }, null, t);
    await Enrolment.create({
      studentId: student.id, academicYearId: year.id, classId, branchId, sectionId, rollNo, enrolledOn: new Date(), status: "active",
    } as any, { transaction: t });
  }

  return { student, credentials };
}

export async function resolveAcademicYear(requested: unknown, branchId: number, admissionDate: unknown, t: Transaction): Promise<AcademicYear> {
  if (requested !== undefined && requested !== null && requested !== "") {
    const y = await AcademicYear.findOne({ where: { id: Number(requested), branchId }, transaction: t });
    if (!y) throw ApiError.badRequest("Selected academic year is not configured for your branch");
    return y;
  }
  const current =
    (await AcademicYear.findOne({ where: { isCurrent: true, branchId }, transaction: t })) ||
    (await AcademicYear.findOne({ where: { branchId }, order: [["startDate", "DESC"]], transaction: t }));
  if (current) return current;
  // First ever admission: create the year so enrolment is not silently skipped.
  const when = new Date(String(admissionDate ?? new Date()));
  const startYear = when.getMonth() >= 6 ? when.getFullYear() : when.getFullYear() - 1;
  const name = `${startYear}-${startYear + 1}`;
  const [year] = await AcademicYear.findOrCreate({
    where: { name, branchId },
    defaults: { name, branchId, startDate: new Date(startYear, 6, 1), endDate: new Date(startYear + 1, 5, 30), isCurrent: true, isClosed: false } as any,
    transaction: t,
  });
  return year;
}

/** Uses the given roll number (must be free in that section/class) or the next number in the section. */
export async function pickRollNo(
  wanted: unknown, scope: { yearId: number; classId: number; sectionId: number | null }, selfStudentId: number | null, t: Transaction
): Promise<string | undefined> {
  const where: any = { academicYearId: scope.yearId, classId: scope.classId, status: "active", ...(scope.sectionId ? { sectionId: scope.sectionId } : {}) };
  if (selfStudentId) where.studentId = { [Op.ne]: selfStudentId };
  const w = wanted === undefined || wanted === null ? "" : String(wanted).trim();
  if (w) {
    if (w.length > 50) throw ApiError.badRequest("Roll number is too long");
    const clash = await Enrolment.findOne({ where: { ...where, rollNo: w }, transaction: t });
    if (clash) throw ApiError.conflict(`Roll number ${w} is already used in this ${scope.sectionId ? "section" : "class"}`);
    return w;
  }
  if (!scope.sectionId) return undefined;
  const rows = await Enrolment.findAll({ where, attributes: ["rollNo"], transaction: t });
  const max = rows.reduce((m, r) => Math.max(m, parseInt(String(r.rollNo ?? ""), 10) || 0), 0);
  return String(max + 1);
}

/* ------------------------------------------------------------------ lifecycle */

/** Enable/disable the student's login together with the student record. */
export async function setStudentLogin(student: Student, isActive: boolean, t?: Transaction): Promise<void> {
  if (!student.userId) return;
  await User.update({ isActive }, { where: { id: student.userId }, transaction: t });
  if (!isActive) {
    await RefreshToken.update({ revoked: true, revokedAt: new Date() }, { where: { userId: student.userId, revoked: false }, transaction: t });
  }
  invalidateActiveCache(Number(student.userId));
}

export async function assertSectionHasRoom(branchId: number | null | undefined, studentId: number, sectionId: number, classId: number, t?: Transaction): Promise<void> {
  const section = await Section.findOne({
    where: { id: sectionId, classId, ...(branchId != null ? { branchId } : {}), isActive: true }, transaction: t,
    ...(t ? { lock: t.LOCK.UPDATE } : {}),
  });
  if (!section) throw ApiError.badRequest("Section is inactive or does not belong to the class");
  if (Number(section.capacity) > 0) {
    const taken = await Enrolment.count({ where: { sectionId, status: "active", studentId: { [Op.ne]: studentId } }, transaction: t });
    if (taken >= Number(section.capacity)) throw ApiError.badRequest(`Section ${section.name} is full (capacity ${section.capacity})`);
  }
}

export async function reactivateStudent(branchId: number | null | undefined, student: Student, t?: Transaction): Promise<void> {
  const classId = Number(student.currentClassId ?? 0);
  const sectionId = student.currentSectionId != null ? Number(student.currentSectionId) : null;
  if (classId && sectionId) await assertSectionHasRoom(branchId, Number(student.id), sectionId, classId, t);
  await student.update({ isActive: true }, { transaction: t });
  await Enrolment.update({ status: "active" }, { where: { studentId: student.id, status: "withdrawn" }, transaction: t });
  await setStudentLogin(student, true, t);
}

export async function deactivateStudent(student: Student, t?: Transaction): Promise<void> {
  await Enrolment.update({ status: "withdrawn" }, { where: { studentId: student.id, status: "active" }, transaction: t });
  await student.update({ isActive: false }, { transaction: t });
  await setStudentLogin(student, false, t);
  // A student who leaves school must not keep a hostel bed: close the stay and free the bed.
  const stays = await HostelAllocation.findAll({ where: { studentId: student.id, status: "active" }, transaction: t });
  for (const stay of stays) {
    await stay.update({ status: "checked_out", checkOut: new Date() }, { transaction: t });
    await syncBed(Number(stay.bedId), t);
  }
}
