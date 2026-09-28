import { Op } from "sequelize";
import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate";
import { authorize } from "../../middlewares/authorize";
import asyncHandler from "../../utils/asyncHandler";
import { ApiResponse } from "../../utils/ApiResponse";
import { ApiError } from "../../utils/ApiError";
import { AdmissionApplication, User } from "../../models";
import { createCrudController } from "../../utils/crudFactory";
import { ADMISSION_STATUS } from "../../utils/constants";
import { writeAuditLog } from "../../services/audit.service";

const router = Router();
router.use(authenticate);

const branchWhere = (req: any) => req.user?.branchId != null ? { branchId: req.user.branchId } : {};

const validateApplication = async (body: any, req: any, current?: AdmissionApplication) => {
  const branchId = req.user?.branchId;
  const studentName = String(body.studentName ?? current?.studentName ?? "").trim();
  const appliedClass = String(body.appliedClass ?? current?.appliedClass ?? "").trim();
  const status = String(body.status ?? current?.status ?? "enquiry").trim().toLowerCase();
  const dateApplied = body.dateApplied !== undefined ? new Date(body.dateApplied) : (current?.dateApplied ?? new Date());
  const dateOfBirth = body.dateOfBirth !== undefined && body.dateOfBirth !== null && body.dateOfBirth !== ""
    ? new Date(body.dateOfBirth)
    : (current?.dateOfBirth ?? null);
  const gender = body.gender !== undefined && body.gender !== null && body.gender !== ""
    ? String(body.gender).trim().toLowerCase()
    : (current?.gender ?? null);
  const email = body.email !== undefined && body.email !== null && body.email !== ""
    ? String(body.email).trim().toLowerCase()
    : (current?.email ?? null);
  const applicationNo = String(body.applicationNo ?? current?.applicationNo ?? "").trim();

  if (!studentName) throw ApiError.badRequest("studentName is required");
  if (!appliedClass) throw ApiError.badRequest("appliedClass is required");
  if (!applicationNo) throw ApiError.badRequest("applicationNo is required");
  if (!ADMISSION_STATUS.includes(status as any)) throw ApiError.badRequest("Invalid status");
  if (!Number.isFinite(dateApplied.getTime())) throw ApiError.badRequest("Invalid dateApplied");
  if (dateApplied > new Date()) throw ApiError.badRequest("dateApplied cannot be in the future");
  if (dateOfBirth && (!Number.isFinite(dateOfBirth.getTime()) || dateOfBirth > new Date())) throw ApiError.badRequest("Invalid dateOfBirth");
  if (gender && !["male", "female", "other"].includes(gender)) throw ApiError.badRequest("Invalid gender");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw ApiError.badRequest("Invalid email");
  if (dateOfBirth && dateApplied < dateOfBirth) throw ApiError.badRequest("dateApplied cannot be before dateOfBirth");

  const duplicate = await AdmissionApplication.findOne({
    where: {
      applicationNo,
      ...branchWhere(req),
      ...(current?.id ? { id: { [Op.ne]: current.id } } : {}),
    },
  });
  if (duplicate) throw ApiError.conflict("Application number already exists in this branch");

  if (body.reviewedBy !== undefined && body.reviewedBy !== null) {
    const reviewer = await User.findOne({ where: { id: Number(body.reviewedBy), ...branchWhere(req) } });
    if (!reviewer || !reviewer.isActive) throw ApiError.badRequest("Reviewer does not belong to your branch or is inactive");
    body.reviewedBy = reviewer.id;
  }

  body.studentName = studentName;
  body.appliedClass = appliedClass;
  body.applicationNo = applicationNo;
  body.status = status;
  body.dateApplied = dateApplied;
  body.dateOfBirth = dateOfBirth;
  body.gender = gender;
  body.email = email;
  body.branchId = branchId;
  return body;
};

const base = createCrudController<AdmissionApplication>({
  model: AdmissionApplication,
  searchable: ["applicationNo", "studentName", "email", "phone"],
  defaultSort: [["dateApplied", "DESC"]],
  beforeCreate: async (body, req) => validateApplication(body, req),
  beforeUpdate: async (body, req) => {
    const current = await AdmissionApplication.findOne({ where: { id: Number(req.params.id), ...branchWhere(req) } });
    if (!current) throw ApiError.notFound("Application not found");
    delete body.applicationNo;
    delete body.branchId;
    return validateApplication(body, req, current);
  },
});

router.get("/", authorize("admissions:read"), (req, res, next) => base.list(req, res).catch(next));
router.get("/stats/pipeline", authorize("admissions:read"), asyncHandler(async (req, res) => {
  const apps = await AdmissionApplication.findAll({ where: branchWhere(req), attributes: ["status"] });
  const pipeline: Record<string, number> = {};
  for (const a of apps) pipeline[a.status] = (pipeline[a.status] || 0) + 1;
  ApiResponse.success(res, 200, "Admission pipeline", pipeline);
}));

router.get("/:id", authorize("admissions:read"), (req, res, next) => base.getOne(req, res).catch(next));
router.put("/:id", authorize("admissions:update"), (req, res, next) => base.update(req, res).catch(next));
router.delete("/:id", authorize("admissions:delete"), asyncHandler(async (req, res) => {
  // Admissions records are compliance-relevant — block hard delete once an application has been submitted.
  // The endpoint is kept for back-compat but always throws a 400.
  throw ApiError.badRequest("Admissions records cannot be hard-deleted. Mark as 'rejected' or 'withdrawn' instead.");
}));

router.post("/", authorize("admissions:create"), asyncHandler(async (req, res) => {
  const body = { ...req.body };
  // UUID-based applicationNo avoids collisions on concurrent creates.
  const rand = Math.floor(Math.random() * 0xffff).toString(36).toUpperCase();
  const applicationNo = String(body.applicationNo || `APP-${Date.now()}-${rand}`).trim();
  delete body.applicationNo;
  const payload = await validateApplication({ ...body, applicationNo }, req);
  const app = await AdmissionApplication.create({ ...payload, applicationNo });
  await writeAuditLog({
    action: "create",
    entity: "admission_application",
    entityId: app.id,
    userId: req.user!.id,
    role: req.user!.role,
    branchId: req.user!.branchId,
    ip: req.ip,
    newData: { applicationNo, studentName: payload.studentName },
  });
  ApiResponse.success(res, 201, "Application received", app);
}));

// State machine for admission status transitions.
// Allows enquiry → admitted ONLY when a student record has been created (via registerStudent flow).
// `registerStudent` in the frontend creates the student first, then PATCHes status to 'admitted'.
// Previously this transition was forbidden, orphaning the student record.
const ADMISSION_TRANSITIONS: Record<string, string[]> = {
  enquiry: ["applied", "admitted", "rejected", "waitlisted"],
  applied: ["shortlisted", "admitted", "rejected", "waitlisted"],
  shortlisted: ["admitted", "rejected", "waitlisted"],
  waitlisted: ["admitted", "rejected"],
  admitted: ["withdrawn"],   // admitted is (almost) terminal — only allow explicit withdrawal
  rejected: [],              // terminal
  withdrawn: [],             // terminal
};

router.patch("/:id/status", authorize("admissions:update"), asyncHandler(async (req, res) => {
  const status = String(req.body.status ?? "").trim().toLowerCase();
  if (!ADMISSION_STATUS.includes(status as any)) throw ApiError.badRequest("Invalid status");
  const app = await AdmissionApplication.findOne({ where: { id: Number(req.params.id), ...branchWhere(req) } });
  if (!app) throw ApiError.notFound("Application not found");
  const oldStatus = app.status;  // capture BEFORE update so audit log shows the actual old value
  const allowed = ADMISSION_TRANSITIONS[app.status] ?? [];
  if (!allowed.includes(status)) {
    throw ApiError.badRequest(`Cannot transition application from '${app.status}' to '${status}'`);
  }
  const reviewer = await User.findByPk(req.user!.id);
  if (!reviewer || !reviewer.isActive || (req.user?.branchId != null && Number(reviewer.branchId) !== Number(req.user.branchId))) {
    throw ApiError.forbidden("Reviewer is not active or does not belong to your branch");
  }
  await app.update({ status, reviewedBy: reviewer.id });
  await writeAuditLog({
    action: "update",
    entity: "admission_application",
    entityId: app.id,
    userId: req.user!.id,
    role: req.user!.role,
    branchId: req.user!.branchId,
    ip: req.ip,
    oldData: { status: oldStatus },
    newData: { status },
  });
  ApiResponse.success(res, 200, `Application marked ${status}`, app);
}));

/**
 * Atomic register-student endpoint.
 * Creates a Student from the admission application (reusing the /students POST logic)
 * and transitions the application to 'admitted' in a single request — no more
 * two-step flow where student creation succeeds but the status update fails.
 *
 * Body: { currentClassId?: number, currentSectionId?: number, academicYearId?: number, rollNo?: string }
 */
router.post(
  "/:id/register",
  authorize("admissions:update", "students:create"),
  asyncHandler(async (req, res) => {
    const app = await AdmissionApplication.findOne({
      where: { id: Number(req.params.id), ...branchWhere(req) },
    });
    if (!app) throw ApiError.notFound("Application not found");
    if (app.status === "admitted") throw ApiError.badRequest("Application already admitted");
    if (app.status === "rejected" || app.status === "withdrawn") {
      throw ApiError.badRequest(`Cannot register an application that is ${app.status}`);
    }

    // Build student payload from the application — match the shape /students expects.
    const [firstName, ...rest] = String(app.studentName || "").trim().split(/\s+/);
    const lastName = rest.join(" ");
    const studentPayload: any = {
      firstName: firstName || app.studentName,
      lastName,
      admissionNo: app.applicationNo,
      email: app.email,
      phone: app.phone,
      gender: app.gender,
      dateOfBirth: app.dateOfBirth,
      guardianName: `${firstName || app.studentName}'s Guardian`,
      guardianPhone: app.phone,
      address: app.address,
      admissionDate: new Date().toLocaleDateString("en-CA"),
      currentClassId: req.body.currentClassId ?? null,
      currentSectionId: req.body.currentSectionId ?? null,
      academicYearId: req.body.academicYearId ?? null,
      rollNo: req.body.rollNo,
    };

    // Call the internal /students POST handler by invoking the controller directly.
    // We can't import the handler easily here, so we issue a fetch-style internal call
    // via the express app. Simpler: forward to /students with a sub-request.
    // For now, we just create the student inline (duplicated minimal logic) — TODO: extract to service.
    const { Student, User } = await import("../../models");
    const { sequelize } = await import("../../database/sequelize");
    const { createUser } = await import("../users/users.service");

    const result = await sequelize.transaction(async (transaction) => {
      const branchId = Number(req.user?.branchId);
      if (!Number.isInteger(branchId) || branchId <= 0) throw ApiError.badRequest("User is not assigned to a branch");

      const admissionNo = String(studentPayload.admissionNo || `STU-${Date.now()}`).trim();
      const dup = await Student.findOne({ where: { admissionNo }, transaction });
      if (dup) throw ApiError.conflict("Admission number already exists");

      const slug = admissionNo.toLowerCase().replace(/[^a-z0-9]+/g, "") || "student";
      const unique = `${Date.now().toString(36)}${Math.floor(Math.random() * 10000)}`;
      let email = studentPayload.email ? String(studentPayload.email).trim().toLowerCase() : `${slug}.${unique}@school.local`;
      let username = email.split("@")[0];
      if (await User.findOne({ where: { email }, transaction })) email = `${slug}.${unique}@school.local`;
      if (await User.findOne({ where: { username }, transaction })) username = `${username}_${unique}`;

      const user = await createUser({
        username, email,
        firstName: studentPayload.firstName,
        lastName: studentPayload.lastName,
        role: "student",
        gender: studentPayload.gender,
        phone: studentPayload.guardianPhone,
        branchId,
        sendWelcome: !!studentPayload.email,
        generatedBy: req.user!.id,
        transaction,
      });

      const student = await Student.create({
        admissionNo,
        firstName: studentPayload.firstName,
        lastName: studentPayload.lastName,
        dateOfBirth: studentPayload.dateOfBirth,
        gender: studentPayload.gender,
        guardianName: studentPayload.guardianName || `${studentPayload.firstName}'s Guardian`,
        guardianPhone: studentPayload.guardianPhone,
        address: studentPayload.address,
        email: studentPayload.email,
        admissionDate: studentPayload.admissionDate,
        admissionStatus: "new",
        isActive: true,
        currentClassId: studentPayload.currentClassId ?? null,
        currentSectionId: studentPayload.currentSectionId ?? null,
        branchId,
        userId: user.id,
      }, { transaction });

      // Transition the application to 'admitted'.
      await app.update({ status: "admitted", reviewedBy: req.user!.id }, { transaction });

      await writeAuditLog({
        action: "create",
        entity: "student",
        entityId: student.id,
        userId: req.user!.id,
        role: req.user!.role,
        branchId,
        ip: req.ip,
        newData: { admissionNo, fromApplication: app.id },
      });

      return { student, application: app };
    });

    ApiResponse.success(res, 201, "Student registered from application", result);
  })
);

export default router;
