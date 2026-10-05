import { Op } from "sequelize";
import { Staff, Teacher, PayrollItem } from "../../models";

/** All payroll payee ids (Staff and Teacher rows) that belong to the same person as this payee. */
export async function personPayeeIds(payeeType: "teacher" | "staff", id: number): Promise<{ staffIds: number[]; teacherIds: number[] }> {
  const own: any = payeeType === "staff" ? await Staff.findByPk(id, { attributes: ["id", "userId"] }) : await Teacher.findByPk(id, { attributes: ["id", "userId"] });
  const staffIds = new Set<number>(payeeType === "staff" ? [id] : []);
  const teacherIds = new Set<number>(payeeType === "teacher" ? [id] : []);
  if (own?.userId) {
    for (const s of await Staff.findAll({ where: { userId: own.userId }, attributes: ["id"] })) staffIds.add(Number(s.id));
    for (const t of await Teacher.findAll({ where: { userId: own.userId }, attributes: ["id"] })) teacherIds.add(Number(t.id));
  }
  return { staffIds: Array.from(staffIds), teacherIds: Array.from(teacherIds) };
}

/** An existing payroll item for the same PERSON and month (a teacher has a Teacher and a Staff row). */
export async function findPersonDuplicate(payeeType: "teacher" | "staff", id: number, month: string, branchId: number | null | undefined, excludeId?: number) {
  const { staffIds, teacherIds } = await personPayeeIds(payeeType, id);
  const ors: any[] = [];
  if (staffIds.length) ors.push({ staffId: { [Op.in]: staffIds } });
  if (teacherIds.length) ors.push({ teacherId: { [Op.in]: teacherIds } });
  return PayrollItem.findOne({
    where: { month, [Op.or]: ors, ...(branchId != null ? { branchId } : {}), ...(excludeId ? { id: { [Op.ne]: excludeId } } : {}) } as any,
  });
}
