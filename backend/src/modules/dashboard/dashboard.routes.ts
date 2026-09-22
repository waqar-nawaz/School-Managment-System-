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
  asyncHandler(async (_req, res) => {
    const today = new Date().toISOString().slice(0, 10);

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
      Student.count({ where: { isActive: true } }),
      Teacher.count({ where: { isActive: true } }),
      Staff.count({ where: { isActive: true } }),
      SchoolClass.count({ where: { isActive: true } }),
      Invoice.count({ where: { status: ["pending", "partial", "overdue"] } }),
      Attendance.count({ where: { date: today, status: "present" } }),
      Event.count({ where: { startAt: { [Op.gte]: new Date() } } }),
      LeaveRequest.count({ where: { status: "pending" } }),
      AdmissionApplication.count({ where: { status: ["enquiry", "applied"] } }),
      Enrolment.count({ where: { status: "active" } }),
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
    const rows = await Attendance.findAll({ where: { date }, attributes: ["status"], raw: true });
    const summary: Record<string, number> = {};
    for (const r of rows) summary[r.status] = (summary[r.status] || 0) + 1;
    ApiResponse.success(res, 200, "Attendance summary", summary);
  })
);

export default router;