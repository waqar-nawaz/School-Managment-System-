/** Payroll, payslips and leave requests */
import { ApiError } from "../../../utils/ApiError";
import { Op } from "sequelize";
import {
  Teacher,
  Staff,
  PayrollItem,
  Payslip,
  LeaveRequest,
  User,
} from "../../../models";
import { getPermissionsForRole } from "../../../services/rbac.service";
import { ResourceDefinition } from "./shared";

export const HR_RESOURCES: ResourceDefinition[] = [
  {
    path: "payroll", model: PayrollItem, searchable: ["month", "status"], permission: "payroll",
    beforeCreate: async (body, req) => {
      const month = String(body.month ?? "").trim();
      const branchId = req.user?.branchId;
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw ApiError.badRequest("month must be in YYYY-MM format");
      const payeeType = body.payeeType === "staff" ? "staff" : body.payeeType === "teacher" ? "teacher" : null;
      if (!payeeType) throw ApiError.badRequest("payeeType must be teacher or staff");
      const teacherId = body.teacherId ? Number(body.teacherId) : null;
      const staffId = body.staffId ? Number(body.staffId) : null;
      if ((payeeType === "teacher" && (!teacherId || staffId)) || (payeeType === "staff" && (!staffId || teacherId))) {
        throw ApiError.badRequest("Payroll must reference exactly one matching teacher or staff member");
      }
      const payee = payeeType === "teacher"
        ? await Teacher.findByPk(teacherId as number, { include: [{ model: User, where: branchId != null ? { branchId } : undefined, required: branchId != null }] })
        : await Staff.findByPk(staffId as number, { include: [{ model: User, where: branchId != null ? { branchId } : undefined, required: branchId != null }] });
      if (!payee || !payee.isActive) throw ApiError.badRequest("Selected payroll payee is not active or does not belong to your branch");
      const duplicate = await PayrollItem.findOne({ where: { ...(branchId != null ? { branchId } : {}), ...(payeeType === "teacher" ? { teacherId } : { staffId }), month } });
      if (duplicate) throw ApiError.badRequest("Payroll already exists for this payee and month");
      const basicSalary = Number(body.basicSalary);
      const allowances = Number(body.allowances ?? 0);
      const deductions = Number(body.deductions ?? 0);
      if (!Number.isFinite(basicSalary) || basicSalary < 0 || !Number.isFinite(allowances) || allowances < 0 || !Number.isFinite(deductions) || deductions < 0) {
        throw ApiError.badRequest("Salary amounts must be valid non-negative numbers");
      }
      const status = String(body.status ?? "draft");
      if (!["draft", "approved", "paid"].includes(status)) throw ApiError.badRequest("Invalid payroll status");
      if (status === "paid" && !body.paidOn) throw ApiError.badRequest("paidOn is required when payroll status is paid");
      if (body.paidOn && !Number.isFinite(new Date(body.paidOn).getTime())) throw ApiError.badRequest("Invalid paidOn date");
      body.branchId = branchId;
      body.month = month;
      body.payeeType = payeeType;
      body.teacherId = payeeType === "teacher" ? teacherId : null;
      body.staffId = payeeType === "staff" ? staffId : null;
      body.basicSalary = basicSalary;
      body.allowances = allowances;
      body.deductions = deductions;
      body.netPay = basicSalary + allowances - deductions;
      return body;
    },
    beforeUpdate: async (body, req) => {
      const id = Number(req.params.id);
      const current = await PayrollItem.findByPk(id);
      if (!current) throw ApiError.badRequest("Payroll item not found");
      if (req.user?.branchId != null && Number(current.branchId) !== Number(req.user.branchId)) throw ApiError.badRequest("Payroll item does not belong to your branch");
      const branchId = req.user?.branchId;
      const month = String(body.month ?? current.month ?? "").trim();
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw ApiError.badRequest("month must be in YYYY-MM format");
      const payeeType = body.payeeType ?? current.payeeType;
      if (payeeType !== "teacher" && payeeType !== "staff") throw ApiError.badRequest("payeeType must be teacher or staff");
      const teacherId = body.teacherId !== undefined ? (body.teacherId ? Number(body.teacherId) : null) : (current.teacherId ?? null);
      const staffId = body.staffId !== undefined ? (body.staffId ? Number(body.staffId) : null) : (current.staffId ?? null);
      if ((payeeType === "teacher" && (!teacherId || staffId)) || (payeeType === "staff" && (!staffId || teacherId))) {
        throw ApiError.badRequest("Payroll must reference exactly one matching teacher or staff member");
      }
      const payee = payeeType === "teacher"
        ? await Teacher.findByPk(teacherId as number, { include: [{ model: User, where: branchId != null ? { branchId } : undefined, required: branchId != null }] })
        : await Staff.findByPk(staffId as number, { include: [{ model: User, where: branchId != null ? { branchId } : undefined, required: branchId != null }] });
      if (!payee || !payee.isActive) throw ApiError.badRequest("Selected payroll payee is not active or does not belong to your branch");
      const duplicate = await PayrollItem.findOne({ where: { ...(branchId != null ? { branchId } : {}), ...(payeeType === "teacher" ? { teacherId } : { staffId }), month, id: { [Op.ne]: id } } });
      if (duplicate) throw ApiError.badRequest("Payroll already exists for this payee and month");
      const basicSalary = Number(body.basicSalary ?? current.basicSalary);
      const allowances = Number(body.allowances ?? current.allowances ?? 0);
      const deductions = Number(body.deductions ?? current.deductions ?? 0);
      if (!Number.isFinite(basicSalary) || basicSalary < 0 || !Number.isFinite(allowances) || allowances < 0 || !Number.isFinite(deductions) || deductions < 0) {
        throw ApiError.badRequest("Salary amounts must be valid non-negative numbers");
      }
      const status = String(body.status ?? current.status);
      if (!["draft", "approved", "paid"].includes(status)) throw ApiError.badRequest("Invalid payroll status");
      if (status === "paid" && !(body.paidOn ?? current.paidOn)) throw ApiError.badRequest("paidOn is required when payroll status is paid");
      if (body.paidOn && !Number.isFinite(new Date(body.paidOn).getTime())) throw ApiError.badRequest("Invalid paidOn date");
      body.branchId = current.branchId ?? branchId;
      body.month = month;
      body.payeeType = payeeType;
      body.teacherId = payeeType === "teacher" ? teacherId : null;
      body.staffId = payeeType === "staff" ? staffId : null;
      body.basicSalary = basicSalary;
      body.allowances = allowances;
      body.deductions = deductions;
      body.netPay = basicSalary + allowances - deductions;
      return body;
    },
  },
  {
    path: "payslips", model: Payslip, searchable: ["payslipNo"], permission: "payroll",
    beforeCreate: async (body, req) => {
      const branchId = req.user?.branchId;
      const payrollItemId = Number(body.payrollItemId);
      if (!Number.isInteger(payrollItemId) || payrollItemId <= 0) throw ApiError.badRequest("payrollItemId is required");
      const item = await PayrollItem.findByPk(payrollItemId);
      if (!item) throw ApiError.badRequest("Payroll item not found");
      if (branchId != null && Number(item.branchId) !== Number(branchId)) throw ApiError.badRequest("Payroll item does not belong to your branch");
      const existing = await Payslip.findOne({ where: { payrollItemId, ...(branchId != null ? { branchId } : {}) } });
      if (existing) throw ApiError.badRequest("A payslip already exists for this payroll item");
      if ((body.gross === undefined || body.gross === null || body.gross === "") || (body.net === undefined || body.net === null || body.net === "")) {
        body.gross = Number(item.basicSalary) + Number(item.allowances ?? 0);
        body.net = Number(item.netPay ?? body.gross);
      }
      const gross = Number(body.gross);
      const net = Number(body.net);
      if (!Number.isFinite(gross) || gross < 0 || !Number.isFinite(net) || net < 0 || net > gross) throw ApiError.badRequest("Payslip gross/net amounts are invalid");
      body.branchId = item.branchId ?? branchId;
      body.gross = gross;
      body.net = net;
      return body;
    },
    beforeUpdate: async (body, req) => {
      const id = Number(req.params.id);
      const current = await Payslip.findByPk(id);
      if (!current) throw ApiError.badRequest("Payslip not found");
      if (req.user?.branchId != null && Number(current.branchId) !== Number(req.user.branchId)) throw ApiError.badRequest("Payslip does not belong to your branch");
      if (body.payrollItemId !== undefined && Number(body.payrollItemId) !== Number(current.payrollItemId)) throw ApiError.badRequest("Payroll item cannot be changed on a payslip");
      const gross = Number(body.gross ?? current.gross);
      const net = Number(body.net ?? current.net);
      if (!Number.isFinite(gross) || gross < 0 || !Number.isFinite(net) || net < 0 || net > gross) throw ApiError.badRequest("Payslip gross/net amounts are invalid");
      body.payrollItemId = current.payrollItemId;
      body.branchId = current.branchId ?? req.user?.branchId;
      body.gross = gross;
      body.net = net;
      return body;
    },
  },
  {
    path: "leaves", model: LeaveRequest, searchable: ["leaveType", "status"], permission: "leaves",
    // Everyone sees only their own leaves except school management (who approve them).
    scopeWhere: (req) => ["super_admin", "admin", "principal"].includes(String(req.user?.role ?? "")) ? {} : { userId: req.user?.id },
    beforeCreate: async (body, req) => {
      const userId = Number(req.user?.id);
      const branchId = req.user?.branchId;
      const leaveType = String(body.leaveType ?? "").trim().toLowerCase();
      const startDate = new Date(body.startDate);
      const endDate = new Date(body.endDate);
      if (!userId) throw ApiError.badRequest("Authenticated user is required");
      if (!["sick", "casual", "annual", "unpaid", "maternity"].includes(leaveType)) throw ApiError.badRequest("Invalid leave type");
      if (!Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime()) || endDate < startDate) throw ApiError.badRequest("Invalid leave date range");
      const days = Math.floor((Date.UTC(endDate.getFullYear(), endDate.getMonth(), endDate.getDate()) - Date.UTC(startDate.getFullYear(), startDate.getMonth(), startDate.getDate())) / 86400000) + 1;
      const user = await User.findByPk(userId);
      if (!user || !user.isActive) throw ApiError.badRequest("User is not active");
      if (branchId != null && Number(user.branchId) !== Number(branchId)) throw ApiError.badRequest("User does not belong to your branch");
      const overlap = await LeaveRequest.findOne({
        where: {
          userId,
          ...(branchId != null ? { branchId } : {}),
          status: { [Op.in]: ["pending", "approved"] },
          startDate: { [Op.lte]: endDate },
          endDate: { [Op.gte]: startDate },
        },
      });
      if (overlap) throw ApiError.badRequest("An overlapping pending or approved leave already exists");
      body.userId = userId;
      body.branchId = branchId;
      body.leaveType = leaveType;
      body.startDate = startDate;
      body.endDate = endDate;
      body.days = days;
      body.status = "pending";
      delete body.processedBy;
      return body;
    },
    beforeUpdate: async (body, req) => {
      const id = Number(req.params.id);
      const current = await LeaveRequest.findByPk(id);
      if (!current) throw ApiError.badRequest("Leave request not found");
      const role = String(req.user?.role ?? "");
      const approver = ["super_admin", "admin", "principal"].includes(role) || (await getPermissionsForRole(role)).includes("leaves:approve");
      if (!approver && Number(current.userId) !== Number(req.user?.id)) throw ApiError.forbidden("You can only update your own leave request");
      if (!approver && current.status !== "pending") throw ApiError.badRequest("Only pending leave requests can be changed by the requester");
      if (!approver && body.status !== undefined && String(body.status).toLowerCase() !== "cancelled") throw ApiError.forbidden("You can only cancel your own pending leave request");
      if (approver && body.status !== undefined && !["pending","approved","rejected"].includes(String(body.status).toLowerCase())) throw ApiError.badRequest("Approver can only set leave status to pending, approved, or rejected");
      if (req.user?.branchId != null && Number(current.branchId) !== Number(req.user.branchId)) throw ApiError.badRequest("Leave request does not belong to your branch");
      const startDate = body.startDate !== undefined ? new Date(body.startDate) : new Date(current.startDate);
      const endDate = body.endDate !== undefined ? new Date(body.endDate) : new Date(current.endDate);
      // Days always follow the dates (previously editing the dates left a stale day count).
      const datesChanged = body.startDate !== undefined || body.endDate !== undefined;
      const days = datesChanged
        ? Math.floor((Date.UTC(endDate.getFullYear(), endDate.getMonth(), endDate.getDate()) - Date.UTC(startDate.getFullYear(), startDate.getMonth(), startDate.getDate())) / 86400000) + 1
        : Number(current.days);
      const leaveType = String(body.leaveType ?? current.leaveType).trim().toLowerCase();
      const status = String(body.status ?? current.status).toLowerCase();
      if (!["sick", "casual", "annual", "unpaid", "maternity"].includes(leaveType)) throw ApiError.badRequest("Invalid leave type");
      if (!Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime()) || endDate < startDate) throw ApiError.badRequest("Invalid leave date range");
      if (!Number.isFinite(days) || days <= 0) throw ApiError.badRequest("days must be greater than 0");
      if (!["pending", "approved", "rejected", "cancelled"].includes(status)) throw ApiError.badRequest("Invalid leave status");
      const overlap = await LeaveRequest.findOne({
        where: {
          userId: current.userId,
          ...(req.user?.branchId != null ? { branchId: req.user.branchId } : {}),
          status: { [Op.in]: ["pending", "approved"] },
          startDate: { [Op.lte]: endDate },
          endDate: { [Op.gte]: startDate },
          id: { [Op.ne]: id },
        },
      });
      if (overlap && status !== "rejected" && status !== "cancelled") throw ApiError.badRequest("An overlapping pending or approved leave already exists");
      body.userId = current.userId;
      body.branchId = current.branchId ?? req.user?.branchId;
      body.leaveType = leaveType;
      body.startDate = startDate;
      body.endDate = endDate;
      body.days = days;
      if (status !== "pending") {
        body.processedBy = req.user?.id;
      } else {
        delete body.processedBy;
      }
      body.status = status;
      return body;
    },
  },
];
