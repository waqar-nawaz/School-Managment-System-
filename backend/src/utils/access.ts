import { WhereOptions } from "sequelize";
import { ApiError } from "./ApiError";
import { Parent, Student, StudentGuardian } from "../models";

/** Roles that act on behalf of the whole school and are not limited to "my" records. */
export const PRIVILEGED_ROLES = new Set(["super_admin", "admin", "principal"]);

export type AnyReq = { user?: { id: number; role: string; branchId?: number | null } };

/**
 * Students a portal user is allowed to see.
 *  - parent  -> the children linked to them
 *  - student -> themselves
 *  - anyone else -> null (no per-student restriction; branch scoping still applies)
 */
export async function ownStudentIds(req: AnyReq): Promise<number[] | null> {
  const user = req.user;
  if (!user) return [];
  if (user.role === "parent") {
    const parent = await Parent.findOne({ where: { userId: user.id }, attributes: ["id"] });
    if (!parent) return [];
    const links = await StudentGuardian.findAll({ where: { parentId: parent.id }, attributes: ["studentId"] });
    return links.map((l) => Number(l.studentId));
  }
  if (user.role === "student") {
    const student = await Student.findOne({ where: { userId: user.id }, attributes: ["id"] });
    return student ? [Number(student.id)] : [];
  }
  return null;
}

/** where-clause fragment limiting `field` to the caller's own students (parents/students only). */
export async function studentScope(req: AnyReq, field = "studentId"): Promise<WhereOptions> {
  const ids = await ownStudentIds(req);
  return ids === null ? {} : ({ [field]: ids } as WhereOptions);
}

/** Load a student and make sure the caller may see it (branch + parent/student ownership). */
export async function assertStudentAccess(req: AnyReq, studentId: number): Promise<Student> {
  const student = await Student.findByPk(studentId);
  if (!student) throw ApiError.notFound("Student not found");
  const own = await ownStudentIds(req);
  if (own !== null) {
    if (!own.includes(Number(studentId))) {
      throw ApiError.forbidden(req.user?.role === "parent" ? "You can only access your linked students" : "You can only access your own record");
    }
  } else if (req.user?.branchId != null && Number(student.branchId) !== Number(req.user.branchId)) {
    throw ApiError.notFound("Student not found");
  }
  return student;
}

/** Health/medical details are only for admins, the family and the student. */
export function canSeeMedical(role?: string): boolean {
  return !!role && (PRIVILEGED_ROLES.has(role) || role === "parent" || role === "student");
}
