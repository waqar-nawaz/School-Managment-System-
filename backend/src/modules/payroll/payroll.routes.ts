import { Router } from "express";
import { Op } from "sequelize";
import { authenticate } from "../../middlewares/authenticate";
import { authorize } from "../../middlewares/authorize";
import asyncHandler from "../../utils/asyncHandler";
import { ApiResponse } from "../../utils/ApiResponse";
import { ApiError } from "../../utils/ApiError";
import { sequelize } from "../../database/sequelize";
import { writeAuditLog } from "../../services/audit.service";
import { PayrollItem, Payslip, Staff, Teacher, User } from "../../models";


const router = Router();
router.use(authenticate);

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const thisMonth = () => new Date().toISOString().slice(0, 7);
const nextMonth = () => { const d = new Date(); d.setUTCMonth(d.getUTCMonth() + 1); return d.toISOString().slice(0, 7); };

function monthOf(req: any): string {
  const m = String(req.body?.month ?? req.query?.month ?? thisMonth());
  if (!MONTH_RE.test(m)) throw ApiError.badRequest("Month must look like 2026-10");
  if (m > nextMonth()) throw ApiError.badRequest("Payroll cannot be prepared more than one month ahead");
  return m;
}
const branchWhere = (req: any) => (req.user?.branchId != null ? { branchId: req.user.branchId } : {});

/**
 * An employee's own salary slips (approved or paid months only, newest first). No finance permission
 * is needed: it only ever returns the caller's own rows (matched through their login).
 */
router.get("/my", authorize("payslips:self"), asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const [staff, teachers] = await Promise.all([
    Staff.findAll({ where: { userId }, attributes: ["id"] }),
    Teacher.findAll({ where: { userId }, attributes: ["id"] }),
  ]);
  const ors: any[] = [];
  if (staff.length) ors.push({ staffId: { [Op.in]: staff.map((x) => Number(x.id)) } });
  if (teachers.length) ors.push({ teacherId: { [Op.in]: teachers.map((x) => Number(x.id)) } });
  const rows = ors.length
    ? await PayrollItem.findAll({
        where: { status: { [Op.in]: ["approved", "paid"] }, [Op.or]: ors },
        attributes: ["id", "month", "basicSalary", "allowances", "deductions", "netPay", "status", "paidOn"],
        order: [["month", "DESC"]], limit: 36,
      })
    : [];
  const me = staff[0] ? await Staff.findByPk(staff[0].id, { attributes: ["staffNo", "firstName", "lastName", "designation"] }) : null;
  ApiResponse.success(res, 200, "My payslips", { employee: me ? { staffNo: me.staffNo, name: `${me.firstName} ${me.lastName}`.trim(), designation: me.designation } : null, items: rows });
}));

/** Totals for the Payroll page header. */
router.get("/summary", authorize("payroll:read"), asyncHandler(async (req, res) => {
  const month = monthOf(req);
  const items = await PayrollItem.findAll({ where: { month, ...branchWhere(req) }, attributes: ["status", "netPay"] });
  const out = { month, count: items.length, draft: 0, approved: 0, paid: 0, totalNet: 0, totalPaid: 0, totalPending: 0, withoutSalary: 0, notYetOnPayroll: 0 };
  for (const i of items) {
    (out as any)[i.status] = ((out as any)[i.status] || 0) + 1;
    out.totalNet += Number(i.netPay);
    if (i.status === "paid") out.totalPaid += Number(i.netPay); else out.totalPending += Number(i.netPay);
  }
  const staff = await Staff.findAll({ where: { isActive: true, ...branchWhere(req) }, attributes: ["id", "userId", "basicSalary"] });
  const have = await PayrollItem.findAll({ where: { month, ...branchWhere(req) }, attributes: ["staffId", "teacherId"] });
  const staffIdsOnPayroll = new Set(have.map((h) => Number(h.staffId)).filter(Boolean));
  const teacherUserIds = new Set<number>();
  const tIds = have.map((h) => Number(h.teacherId)).filter(Boolean);
  if (tIds.length) for (const t of await Teacher.findAll({ where: { id: tIds }, attributes: ["userId"] })) if (t.userId) teacherUserIds.add(Number(t.userId));
  for (const s of staff) {
    if (!(Number(s.basicSalary) > 0)) out.withoutSalary++;
    else if (!staffIdsOnPayroll.has(Number(s.id)) && !(s.userId && teacherUserIds.has(Number(s.userId)))) out.notYetOnPayroll++;
  }
  ApiResponse.success(res, 200, "Payroll summary", out);
}));

/**
 * Prepare the month: one DRAFT item for every active employee who has a basic salary, unless that
 * person already has an item for the month (counted per person, so a teacher is never paid twice
 * through their Teacher and Staff records). Safe to run again.
 */
router.post("/generate", authorize("payroll:create"), asyncHandler(async (req, res) => {
  const month = monthOf(req);
  const branchId = req.user?.branchId ?? null;
  const people = await Staff.findAll({ where: { isActive: true, ...branchWhere(req) }, include: [{ model: User, attributes: ["id", "isActive"], required: false }], order: [["staffNo", "ASC"]] });
  const existing = await PayrollItem.findAll({ where: { month, ...branchWhere(req) }, attributes: ["staffId", "teacherId"] });
  const staffDone = new Set(existing.map((e) => Number(e.staffId)).filter(Boolean));
  const teacherIds = existing.map((e) => Number(e.teacherId)).filter(Boolean);
  const teacherUsersDone = new Set<number>();
  if (teacherIds.length) for (const t of await Teacher.findAll({ where: { id: teacherIds }, attributes: ["userId"] })) if (t.userId) teacherUsersDone.add(Number(t.userId));

  const created: Array<{ name: string; staffNo: string; net: number }> = [];
  let skippedExisting = 0, skippedNoSalary = 0, skippedInactiveLogin = 0;
  await sequelize.transaction(async (t) => {
    for (const s of people as any[]) {
      if (s.userId && s.User && s.User.isActive === false) { skippedInactiveLogin++; continue; }
      if (staffDone.has(Number(s.id)) || (s.userId && teacherUsersDone.has(Number(s.userId)))) { skippedExisting++; continue; }
      const basic = Number(s.basicSalary);
      if (!(basic > 0)) { skippedNoSalary++; continue; }
      await PayrollItem.create({
        branchId: s.branchId ?? branchId, month, payeeType: "staff", staffId: s.id, teacherId: null,
        basicSalary: basic, allowances: 0, deductions: 0, netPay: basic, status: "draft",
      } as any, { transaction: t });
      created.push({ name: `${s.firstName} ${s.lastName}`.trim(), staffNo: s.staffNo, net: basic });
    }
  });
  await writeAuditLog({
    action: "create", entity: "payroll", entityId: 0, userId: req.user!.id, role: req.user!.role, branchId, ip: req.ip,
    newData: { event: "payroll_generated", month, created: created.length },
  } as any);
  ApiResponse.success(res, 201, created.length ? `Payroll prepared for ${created.length} employee(s)` : "Nothing new to prepare", {
    month, created: created.length, skippedExisting, skippedNoSalary, skippedInactiveLogin, total: created.reduce((a, b) => a + b.net, 0), people: created.slice(0, 100),
  });
}));

/** Move every item of a month one step forward: draft -> approved, or approved -> paid. */
router.post("/bulk-status", authorize("payroll:update"), asyncHandler(async (req, res) => {
  const month = monthOf(req);
  const from = String(req.body?.from ?? ""), to = String(req.body?.to ?? "");
  const allowed: Record<string, string> = { draft: "approved", approved: "paid" };
  if (allowed[from] !== to) throw ApiError.badRequest("Only draft -> approved and approved -> paid are allowed in bulk");
  let paidOn: Date | null = null;
  if (to === "paid") {
    paidOn = req.body?.paidOn ? new Date(String(req.body.paidOn)) : new Date();
    if (!Number.isFinite(paidOn.getTime())) throw ApiError.badRequest("Paid-on date is not valid");
    if (paidOn.getTime() > Date.now() + 86400000) throw ApiError.badRequest("Paid-on date cannot be in the future");
  }
  const [count] = await PayrollItem.update(
    { status: to, ...(paidOn ? { paidOn } : {}) } as any,
    { where: { month, status: from, ...branchWhere(req) } }
  );
  await writeAuditLog({
    action: "update", entity: "payroll", entityId: 0, userId: req.user!.id, role: req.user!.role, branchId: req.user?.branchId ?? null, ip: req.ip,
    newData: { event: "payroll_bulk_status", month, from, to, count },
  } as any);
  ApiResponse.success(res, 200, count ? `${count} item(s) marked ${to}` : `No ${from} items for ${month}`, { month, updated: count });
}));

/** Create a payslip for every approved/paid item of the month that does not have one yet. */
router.post("/payslips", authorize("payslips:create"), asyncHandler(async (req, res) => {
  const month = monthOf(req);
  const items = await PayrollItem.findAll({ where: { month, status: { [Op.in]: ["approved", "paid"] }, ...branchWhere(req) }, order: [["id", "ASC"]] });
  const have = items.length ? await Payslip.findAll({ where: { payrollItemId: items.map((i) => i.id) }, attributes: ["payrollItemId"] }) : [];
  const done = new Set(have.map((h) => Number(h.payrollItemId)));
  const prefix = `PS-${month.replace("-", "")}-`;
  let created = 0;
  await sequelize.transaction(async (t) => {
    await sequelize.query("SELECT pg_advisory_xact_lock(727103)", { transaction: t });
    const last = await Payslip.findOne({ where: { payslipNo: { [Op.like]: `${prefix}%` } }, order: [["payslipNo", "DESC"]], attributes: ["payslipNo"], transaction: t });
    let n = last ? parseInt(last.payslipNo.slice(prefix.length), 10) || 0 : 0;
    for (const it of items) {
      if (done.has(Number(it.id))) continue;
      n += 1;
      const gross = Number(it.basicSalary) + Number(it.allowances ?? 0);
      await Payslip.create({
        branchId: it.branchId, payslipNo: `${prefix}${String(n).padStart(4, "0")}`, payrollItemId: it.id,
        gross, net: Number(it.netPay),
        earnings: [{ name: "Basic salary", amount: Number(it.basicSalary) }, ...(Number(it.allowances) ? [{ name: "Allowances", amount: Number(it.allowances) }] : [])],
        deductions: Number(it.deductions) ? [{ name: "Deductions", amount: Number(it.deductions) }] : [],
      } as any, { transaction: t });
      created++;
    }
  });
  ApiResponse.success(res, 201, created ? `${created} payslip(s) created` : "Every approved item already has a payslip", { month, created });
}));

export default router;
