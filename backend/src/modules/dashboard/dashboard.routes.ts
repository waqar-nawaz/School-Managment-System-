import { Router } from "express";
import { Op } from "sequelize";
import { authenticate } from "../../middlewares/authenticate";
import { authorize } from "../../middlewares/authorize";
import asyncHandler from "../../utils/asyncHandler";
import { ApiResponse } from "../../utils/ApiResponse";
import {
  Student, Teacher, Staff, SchoolClass, Invoice, Attendance,
  Event, LeaveRequest, AdmissionApplication, Enrolment,
} from "../../models";

const router = Router();
router.use(authenticate);

router.get(
  "/",
  authorize("dashboard:read"),
  asyncHandler(async (req, res) => {
    // Accept an optional ?date=YYYY-MM-DD from the browser so client and server agree on "today"
    // (closes the timezone drift between server-UTC and browser-local).
    const dateParam = typeof req.query.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date as string)
      ? (req.query.date as string)
      : new Date().toLocaleDateString("en-CA");
    const today = dateParam;
    const branchFilter = req.user?.branchId != null ? { branchId: req.user.branchId } : {};

    const [
      students,
      teachers,
      staff,
      classes,
      pendingInvoices,
      presentToday,
      upcomingEvents,
      pendingLeaves,
      admissionApplications,
      activeEnrolments,
    ] = await Promise.all([
      Student.count({ where: { ...branchFilter, isActive: true } }),
      Teacher.count({ where: { ...branchFilter, isActive: true } }),
      Staff.count({ where: { ...branchFilter, isActive: true } }),
      SchoolClass.count({ where: { ...branchFilter, isActive: true } }),
      Invoice.count({ where: { ...branchFilter, status: ["pending", "partial", "overdue"] } }),
      Attendance.count({ where: { ...branchFilter, date: today, status: "present" } }),
      Event.count({ where: { ...branchFilter, startAt: { [Op.gte]: new Date() } } }),
      LeaveRequest.count({ where: { ...branchFilter, status: "pending" } }),
      AdmissionApplication.count({ where: { ...branchFilter, status: ["enquiry", "applied"] } }),
      Enrolment.count({ where: { ...branchFilter, status: "active" } }),
    ]);

    ApiResponse.success(res, 200, "Dashboard stats", {
      students,
      teachers,
      staff,
      classes,
      pendingInvoices,
      presentToday,
      upcomingEvents,
      pendingLeaves,
      admissionApplications,
      activeEnrolments,
    });
  })
);

router.get(
  "/attendance/:date",
  authorize("dashboard:read"),
  asyncHandler(async (req, res) => {
    const date = String(req.params.date);
    const branchFilter = req.user?.branchId != null ? { branchId: req.user.branchId } : {};
    const rows = await Attendance.findAll({ where: { ...branchFilter, date }, attributes: ["status"], raw: true });
    const summary: Record<string, number> = {};
    for (const r of rows) summary[r.status] = (summary[r.status] || 0) + 1;
    ApiResponse.success(res, 200, "Attendance summary", summary);
  })
);

export default router;