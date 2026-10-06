/** Fee types and expenses (invoices/payments live in their own modules) */
import { Request } from "express";
import { ApiError } from "../../../utils/ApiError";
import { Op } from "sequelize";
import {
  FeeType,
  Expense,
  User,
} from "../../../models";
import { ResourceDefinition, getExisting } from "./shared";
import { getPermissionsForRole } from "../../../services/rbac.service";

const validateFeeType = async (body: any, req: Request) => {
  const existing=await getExisting(FeeType,req); const name=String(body.name??existing?.name??"").trim(); const category=String(body.category??existing?.category??"").trim().toLowerCase();
  const amount=Number(body.amount??existing?.amount??0); const installments=Number(body.installments??existing?.installments??1); const billingCycle=String(body.billingCycle??existing?.billingCycle??"term");
  const branchId=Number(req.user?.branchId);
  if(!Number.isInteger(branchId)||branchId<=0) throw ApiError.badRequest("User is not assigned to a branch");
  if(!name) throw ApiError.badRequest("Fee type name is required"); if(name.length>120) throw ApiError.badRequest("Fee type name is too long");
  if(category&&!["tuition","transport","hostel","misc"].includes(category)) throw ApiError.badRequest("Invalid fee category");
  if(!Number.isFinite(amount)||amount<0) throw ApiError.badRequest("Fee amount must be non-negative");
  if(!Number.isInteger(installments)||installments<1) throw ApiError.badRequest("installments must be a positive integer");
  if(!["term","monthly","yearly","one-time"].includes(billingCycle)) throw ApiError.badRequest("Invalid billingCycle");
  const duplicate=await FeeType.findOne({where:{name,branchId,...(existing?.id?{id:{[Op.ne]:existing.id}}:{})}}); if(duplicate) throw ApiError.badRequest("Fee type already exists in this branch");
  body.name=name; body.category=category; body.amount=amount; body.installments=installments; body.billingCycle=billingCycle; body.branchId=branchId; return body;
};

const validateExpense = async (body: any, req: Request) => {
  const existing = await getExisting(Expense, req);
  const title = String(body.title ?? existing?.title ?? "").trim();
  const amount = Number(body.amount ?? existing?.amount);
  const expensedOn = body.expensedOn !== undefined
    ? (body.expensedOn ? new Date(body.expensedOn) : null)
    : (existing?.expensedOn ? new Date(existing.expensedOn) : null);
  const status = String(body.status ?? existing?.status ?? "draft").toLowerCase();
  const branchId = Number(req.user?.branchId);

  if (!Number.isInteger(branchId) || branchId <= 0) throw ApiError.badRequest("User is not assigned to a branch");
  if (!title) throw ApiError.badRequest("Expense title is required");
  if (title.length > 180) throw ApiError.badRequest("Expense title is too long");
  if (!Number.isFinite(amount) || amount < 0) throw ApiError.badRequest("Expense amount must be non-negative");
  if (expensedOn && !Number.isFinite(expensedOn.getTime())) throw ApiError.badRequest("Invalid expensedOn");
  if (!["draft", "approved", "rejected", "paid", "cancelled"].includes(status)) {
    throw ApiError.badRequest("Invalid expense status");
  }

  const permissions = await getPermissionsForRole(req.user!.role);
  const has = (permission: string) => permissions.includes("*") || permissions.includes(permission);
  const previousStatus = existing ? String(existing.status).toLowerCase() : null;
  const isCreate = !existing;

  if (status === "approved" && !has("expenses:approve")) {
    throw ApiError.forbidden("Missing permission: expenses:approve");
  }
  if (status === "paid" && !has("expenses:pay")) {
    throw ApiError.forbidden("Missing permission: expenses:pay");
  }

  if (isCreate) {
    if (status !== "draft" && status !== "rejected" && status !== "cancelled") {
      throw ApiError.badRequest("New expenses must start as draft, rejected, or cancelled");
    }
  } else if (previousStatus !== status) {
    const transitions: Record<string, string[]> = {
      draft: ["approved", "rejected", "cancelled"],
      approved: ["paid", "cancelled"],
      rejected: ["draft", "cancelled"],
      paid: [],
      cancelled: [],
    };
    if (!transitions[previousStatus!]?.includes(status)) {
      throw ApiError.badRequest(`Cannot transition expense from '${previousStatus}' to '${status}'`);
    }
  }

  // Once approved, paid, or cancelled, the financial fields are immutable.
  if (existing && ["approved", "paid", "cancelled"].includes(previousStatus!)) {
    const financialFields = ["title", "category", "amount", "expensedOn", "attachment", "notes"];
    for (const field of financialFields) {
      if (body[field] !== undefined) {
        const current = (existing as any)[field];
        const incoming = body[field];
        if (field === "expensedOn") {
          const a = current ? new Date(current).getTime() : null;
          const b = incoming ? new Date(incoming).getTime() : null;
          if (a !== b) throw ApiError.badRequest("Approved, paid, or cancelled expenses cannot change financial details");
        } else if (JSON.stringify(current ?? null) !== JSON.stringify(incoming ?? null)) {
          throw ApiError.badRequest("Approved, paid, or cancelled expenses cannot change financial details");
        }
      }
    }
  }

  const createdBy = existing?.createdBy ?? req.user!.id;
  let approvedBy = existing?.approvedBy ?? null;
  if (status === "approved" || status === "paid") {
    if (!approvedBy) approvedBy = req.user!.id;
  } else if (status === "draft" || status === "rejected" || status === "cancelled") {
    approvedBy = null;
  }

  const creator = await User.findOne({ where: { id: Number(createdBy), branchId } });
  if (!creator) throw ApiError.badRequest("createdBy user does not belong to your branch");
  if (approvedBy) {
    const approver = await User.findOne({ where: { id: Number(approvedBy), branchId } });
    if (!approver) throw ApiError.badRequest("approvedBy user does not belong to your branch");
  }

  body.title = title;
  body.amount = amount;
  body.expensedOn = expensedOn;
  body.status = status;
  body.branchId = branchId;
  body.createdBy = createdBy;
  body.approvedBy = approvedBy;
  return body;
};

export const FINANCE_RESOURCES: ResourceDefinition[] = [
  { path: "fee-types", model: FeeType, searchable: ["name", "category"], permission: "fees", beforeCreate: validateFeeType, beforeUpdate: validateFeeType },
  { path: "expenses", model: Expense, searchable: ["title", "category", "status"], permission: "expenses", beforeCreate: validateExpense, beforeUpdate: validateExpense,
    beforeRemove: async (req) => {
      const e = await Expense.findByPk(Number(req.params.id));
      if (!e) throw ApiError.notFound("Expense not found");
      if (["approved","paid"].includes(String(e.status))) throw ApiError.badRequest(`Cannot delete a ${e.status} expense; cancel it instead`);
    },
  },
];
