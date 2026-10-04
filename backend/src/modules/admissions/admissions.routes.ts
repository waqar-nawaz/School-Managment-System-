import { Op } from "sequelize";
import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate";
import { authorize } from "../../middlewares/authorize";
import asyncHandler from "../../utils/asyncHandler";
import { ApiResponse } from "../../utils/ApiResponse";
import { ApiError } from "../../utils/ApiError";
import { AdmissionApplication, User, Student, SchoolClass } from "../../models";
import { sequelize } from "../../database/sequelize";
import { admitStudent, deactivateStudent, cleanPhone, cleanGender } from "../students/students.service";
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
  const phone = body.phone !== undefined ? cleanPhone(body.phone, "Phone") : (current?.phone ?? null);
  const guardianName = body.guardianName !== undefined ? (String(body.guardianName ?? "").trim() || null) : (current?.guardianName ?? null);
  const guardianRelation = body.guardianRelation !== undefined ? (String(body.guardianRelation ?? "").trim() || null) : (current?.guardianRelation ?? null);
  if (guardianName && guardianName.length > 120) throw ApiError.badRequest("Guardian name is too long");

  if (!studentName) throw ApiError.badRequest("studentName is required");
  if (!appliedClass) throw ApiError.badRequest("appliedClass is required");
  if (!applicationNo) throw ApiError.badRequest("applicationNo is required");
  if (!ADMISSION_STATUS.includes(status as any)) throw ApiError.badRequest("Invalid status");
  if (!Number.isFinite(dateApplied.getTime())) throw ApiError.badRequest("Invalid dateApplied");
  if (dateApplied > new Date()) throw ApiError.badRequest("dateApplied cannot be in the future");
  if (dateOfBirth && (!Number.isFinite(dateOfBirth.getTime()) || dateOfBirth > new Date())) throw ApiError.badRequest("Invalid dateOfBirth");
  if (gender) cleanGender(gender);
  if (studentName.length > 120) throw ApiError.badRequest("Student name is too long (max 120)");
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

  // The same child applying twice (typo-proof: name ignoring case/spaces + date of birth) is almost
  // always a double entry; point the clerk at the existing application instead.
  if (dateOfBirth && !["rejected", "withdrawn"].includes(status)) {
    const sameDay = new Date(dateOfBirth.toISOString().slice(0, 10));
    const twin = await AdmissionApplication.findOne({
      where: {
        studentName: { [Op.iLike]: studentName.replace(/\s+/g, " ") },
        dateOfBirth: { [Op.gte]: sameDay, [Op.lt]: new Date(sameDay.getTime() + 86400000) },
        status: { [Op.notIn]: ["rejected", "withdrawn"] },
        ...branchWhere(req),
        ...(current?.id ? { id: { [Op.ne]: current.id } } : {}),
      },
    });
    if (twin) throw ApiError.conflict(`${studentName} (same date of birth) already has application ${twin.applicationNo} (${twin.status})`);
  }

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
  body.phone = phone;
  body.guardianName = guardianName;
  body.guardianRelation = guardianRelation;
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
    delete body.studentId;
    if (["admitted", "rejected", "withdrawn"].includes(current.status)) {
      // Once decided, the record (and for admitted ones the student created from it) is frozen.
      if (Object.keys(body).some((k) => k !== "remarks")) {
        throw ApiError.badRequest(`This application is ${current.status} and can no longer be edited (only remarks can be added).`);
      }
      return { remarks: body.remarks };
    }
    // Force clients to use PATCH /:id/status (which enforces the state machine).
    // PUT must not allow free-form status transitions.
    delete body.status;
    return validateApplication(body, req, current);
  },
});

router.get("/", authorize("admissions:read"), (req, res, next) => base.list(req, res).catch(next));
router.get("/stats/pipeline", authorize("admissions:read"), asyncHandler(async (req, res) => {
  const rows = (await AdmissionApplication.findAll({
    where: branchWhere(req), attributes: ["status", [sequelize.fn("COUNT", sequelize.col("id")), "n"]], group: ["status"], raw: true,
  })) as unknown as Array<{ status: string; n: string }>;
  const pipeline: Record<string, number> = {};
  for (const r of rows) pipeline[r.status] = Number(r.n);
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
  // A new application cannot start as admitted/rejected/withdrawn: those are decisions made later
  // ("admitted" only through Register student, which creates the student).
  const startStatus = String(body.status ?? "enquiry").trim().toLowerCase();
  if (!["enquiry", "applied", "shortlisted", "waitlisted"].includes(startStatus)) {
    throw ApiError.badRequest("A new application must start as enquiry, applied, shortlisted or waitlisted");
  }
  delete body.studentId;
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
  // "admitted" is deliberately absent: it only happens through POST /:id/register, which creates the
  // student in the same transaction (marking it admitted by hand left applications with no student).
  enquiry: ["applied", "rejected", "waitlisted"],
  applied: ["shortlisted", "rejected", "waitlisted"],
  shortlisted: ["rejected", "waitlisted"],
  waitlisted: ["rejected"],
  admitted: ["withdrawn"],   // admitted is (almost) terminal — only allow explicit withdrawal
  rejected: [],              // terminal
  withdrawn: [],             // terminal
};

router.patch("/:id/status", authorize("admissions:update"), asyncHandler(async (req, res) => {
  const status = String(req.body.status ?? "").trim().toLowerCase();
  if (!ADMISSION_STATUS.includes(status as any)) throw ApiError.badRequest("Invalid status");
  const app = await AdmissionApplication.findOne({ where: { id: Number(req.params.id), ...branchWhere(req) } });
  if (!app) throw ApiError.notFound("Application not found");
  if (status === "admitted") throw ApiError.badRequest("Use “Register student” to admit an applicant. It creates the student record and their logins.");
  const oldStatus = app.status;  // capture BEFORE update so audit log shows the actual old value
  const allowed = ADMISSION_TRANSITIONS[app.status] ?? [];
  if (!allowed.includes(status)) {
    throw ApiError.badRequest(`Cannot transition application from '${app.status}' to '${status}'`);
  }
  const reviewer = await User.findByPk(req.user!.id);
  if (!reviewer || !reviewer.isActive || (req.user?.branchId != null && Number(reviewer.branchId) !== Number(req.user.branchId))) {
    throw ApiError.forbidden("Reviewer is not active or does not belong to your branch");
  }
  await sequelize.transaction(async (t) => {
    await app.update({ status, reviewedBy: reviewer.id }, { transaction: t });
    // Withdrawing an admitted applicant withdraws the student created from it (seat, login, hostel bed).
    if (oldStatus === "admitted" && status === "withdrawn" && app.studentId) {
      const student = await Student.findByPk(app.studentId, { transaction: t });
      if (student && student.isActive) await deactivateStudent(student, t);
    }
  });
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
 * Atomic "Register student": creates the student, enrolment, guardian + logins and marks the
 * application admitted in ONE transaction. The application row is locked first, so a double click
 * (or two clerks) can never create two students from one application.
 *
 * Body: { currentClassId?, currentSectionId?, academicYearId?, rollNo?, admissionNo? }
 * Response includes the one-time login details of the accounts that were created.
 */
router.post(
  "/:id/register",
  authorize("admissions:update"),
  authorize("students:create"),
  asyncHandler(async (req, res) => {
    const branchId = Number(req.user?.branchId);
    if (!Number.isInteger(branchId) || branchId <= 0) throw ApiError.badRequest("User is not assigned to a branch");

    const result = await sequelize.transaction(async (t) => {
      const app = await AdmissionApplication.findOne({
        where: { id: Number(req.params.id), ...branchWhere(req) }, transaction: t, lock: t.LOCK.UPDATE,
      });
      if (!app) throw ApiError.notFound("Application not found");
      if (app.status === "admitted") throw ApiError.badRequest("This application has already been admitted");
      if (app.status === "rejected" || app.status === "withdrawn") throw ApiError.badRequest(`Cannot register an application that is ${app.status}`);

      const [firstName, ...rest] = String(app.studentName || "").trim().split(/\s+/);

      // No class picked: fall back to the class the family applied for (exact name, any letter case).
      let classId: unknown = req.body.currentClassId;
      if ((classId === undefined || classId === null || classId === "") && app.appliedClass) {
        const wanted = String(app.appliedClass).trim().toLowerCase();
        const classes = await SchoolClass.findAll({ where: { branchId, isActive: true }, attributes: ["id", "name"], transaction: t });
        const match = classes.find((c) => String(c.name).trim().toLowerCase() === wanted);
        if (match) classId = match.id;
      }

      const { student, credentials } = await admitStudent(
        {
          firstName, lastName: rest.join(" "), admissionNo: req.body.admissionNo, gender: app.gender, dateOfBirth: app.dateOfBirth,
          address: app.address, phone: app.phone,
          currentClassId: classId, currentSectionId: req.body.currentSectionId, academicYearId: req.body.academicYearId, rollNo: req.body.rollNo,
          guardians: app.phone || app.email || app.guardianName
            ? [{ fullName: app.guardianName || `${app.studentName}'s guardian`, relation: app.guardianRelation || "guardian", phone: app.phone, email: app.email, isPrimary: true }]
            : [],
        },
        { branchId, userId: req.user!.id },
        t
      );

      await app.update({ status: "admitted", reviewedBy: req.user!.id, studentId: student.id }, { transaction: t });
      await writeAuditLog({
        action: "create", entity: "student", entityId: student.id, userId: req.user!.id, role: req.user!.role, branchId, ip: req.ip,
        newData: { admissionNo: student.admissionNo, fromApplication: app.id, classId: student.currentClassId, sectionId: student.currentSectionId },
      });
      return { student, application: app, credentials };
    });

    ApiResponse.success(res, 201, "Student registered from application", result);
  })
);

export default router;
