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
  const existing=await getExisting(Expense,req); const title=String(body.title??existing?.title??"").trim(); const amount=Number(body.amount??existing?.amount);
  const expensedOn=body.expensedOn!==undefined?(body.expensedOn?new Date(body.expensedOn):null):(existing?.expensedOn?new Date(existing.expensedOn):null);
  const status=String(body.status??existing?.status??"approved").toLowerCase(); const branchId=Number(req.user?.branchId);
  if(!Number.isInteger(branchId)||branchId<=0) throw ApiError.badRequest("User is not assigned to a branch");
  if(!title) throw ApiError.badRequest("Expense title is required"); if(title.length>200) throw ApiError.badRequest("Expense title is too long");
  if(!Number.isFinite(amount)||amount<0) throw ApiError.badRequest("Expense amount must be non-negative");
  if(expensedOn&&!Number.isFinite(expensedOn.getTime())) throw ApiError.badRequest("Invalid expensedOn");
  if(!["draft","approved","rejected","paid","cancelled"].includes(status)) throw ApiError.badRequest("Invalid expense status");
  const createdBy=body.createdBy??existing?.createdBy, approvedBy=body.approvedBy??existing?.approvedBy;
  if(createdBy){const u=await User.findOne({where:{id:Number(createdBy),branchId}}); if(!u) throw ApiError.badRequest("createdBy user does not belong to your branch");}
  if(approvedBy){const u=await User.findOne({where:{id:Number(approvedBy),branchId}}); if(!u) throw ApiError.badRequest("approvedBy user does not belong to your branch");}
  body.title=title; body.amount=amount; body.expensedOn=expensedOn; body.status=status; body.branchId=branchId; return body;
};

export const FINANCE_RESOURCES: ResourceDefinition[] = [
  { path: "fee-types", model: FeeType, searchable: ["name", "category"], permission: "fees", beforeCreate: validateFeeType, beforeUpdate: validateFeeType },
  { path: "expenses", model: Expense, searchable: ["title", "category", "status"], permission: "expenses", beforeCreate: validateExpense, beforeUpdate: validateExpense },
];
