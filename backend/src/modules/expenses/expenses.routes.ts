import { Router } from "express";
import { Op, fn, col } from "sequelize";
import { authenticate } from "../../middlewares/authenticate";
import { authorize } from "../../middlewares/authorize";
import asyncHandler from "../../utils/asyncHandler";
import { ApiResponse } from "../../utils/ApiResponse";
import { ApiError } from "../../utils/ApiError";
import { Expense } from "../../models";

/**
 * Extra read-only endpoints for the Expenses screen. Create / update / delete / list stay in the generic
 * resource router (modules/resources/definitions/finance.ts), where the approval rules live.
 * Unknown paths fall through to that router.
 */
const router = Router();
router.use(authenticate);

// GET /expenses/summary?month=YYYY-MM  -> totals per status + spending per category for the month.
router.get("/summary", authorize("expenses:read"), asyncHandler(async (req, res) => {
  const month = String(req.query.month ?? new Date().toISOString().slice(0, 7));
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw ApiError.badRequest("month must look like 2026-10");
  const from = new Date(`${month}-01T00:00:00.000Z`);
  const to = new Date(from); to.setUTCMonth(to.getUTCMonth() + 1);
  const where: any = { expensedOn: { [Op.gte]: from, [Op.lt]: to } };
  if (req.user!.branchId != null) where.branchId = req.user!.branchId;

  const rows: any[] = await Expense.findAll({
    where, attributes: ["status", [fn("COUNT", col("id")), "count"], [fn("SUM", col("amount")), "total"]], group: ["status"], raw: true,
  });
  const byStatus: Record<string, { count: number; total: number }> = {};
  for (const r of rows) byStatus[r.status] = { count: Number(r.count), total: Number(r.total || 0) };
  const get = (s: string) => byStatus[s] ?? { count: 0, total: 0 };

  const cats: any[] = await Expense.findAll({
    where: { ...where, status: { [Op.in]: ["approved", "paid"] } },
    attributes: ["category", [fn("SUM", col("amount")), "total"]], group: ["category"], order: [[fn("SUM", col("amount")), "DESC"]], limit: 8, raw: true,
  });

  ApiResponse.success(res, 200, "Expense summary", {
    month,
    spent: get("approved").total + get("paid").total, // what reports count as spending
    toApprove: get("draft"),
    toPay: get("approved"),
    paid: get("paid"),
    rejected: get("rejected"),
    cancelled: get("cancelled"),
    byCategory: cats.map((c) => ({ category: c.category || "Other", total: Number(c.total || 0) })),
  });
}));

export default router;
