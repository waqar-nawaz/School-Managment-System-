import { Router } from "express";
import authRoutes from "../modules/auth/auth.routes";
import usersRoutes from "../modules/users/users.routes";
import dashboardRoutes from "../modules/dashboard/dashboard.routes";
import reportsRoutes from "../modules/reports/reports.routes";
import settingsRoutes from "../modules/settings/settings.routes";
import rolesRoutes from "../modules/roles/roles.routes";
import permissionsRoutes from "../modules/permissions/permissions.routes";
import studentsRoutes from "../modules/students/students.routes";
import admissionsRoutes from "../modules/admissions/admissions.routes";
import attendanceRoutes from "../modules/attendance/attendance.routes";
import invoicesRoutes from "../modules/invoices/invoices.routes";
import paymentsRoutes from "../modules/payments/payments.routes";
import bookIssuesRoutes from "../modules/book-issues/book-issues.routes";
import mediaRoutes from "../modules/media/media.routes";
import certificatesRoutes from "../modules/certificates/certificates.routes";
import resourcesRoutes from "../modules/resources";

const router = Router();

router.use("/auth", authRoutes);
router.use("/users", usersRoutes);
router.use("/dashboard", dashboardRoutes);
router.use("/reports", reportsRoutes);
router.use("/settings", settingsRoutes);
router.use("/roles", rolesRoutes);
router.use("/permissions", permissionsRoutes);
router.use("/students", studentsRoutes);
router.use("/admissions", admissionsRoutes);
router.use("/attendance", attendanceRoutes);
router.use("/invoices", invoicesRoutes);
router.use("/payments", paymentsRoutes);
router.use("/book-issues", bookIssuesRoutes);
router.use("/media", mediaRoutes);
router.use("/certificates", certificatesRoutes);

// Config-driven CRUD for every remaining resource.
router.use("/", resourcesRoutes);

export default router;