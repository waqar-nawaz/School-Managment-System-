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
router.delete("/:id", authorize("admissions:delete"), (req, res, next) => base.remove(req, res).catch(next));

router.post("/", authorize("admissions:create"), asyncHandler(async (req, res) => {
  const body = { ...req.body };
  const applicationNo = String(body.applicationNo || `APP-${Date.now()}-${Math.floor(Math.random() * 1000)}`).trim();
  delete body.applicationNo;
  const payload = await validateApplication({ ...body, applicationNo }, req);
  const app = await AdmissionApplication.create({ ...payload, applicationNo });
  ApiResponse.success(res, 201, "Application received", app);
}));

router.patch("/:id/status", authorize("admissions:update"), asyncHandler(async (req, res) => {
  const status = String(req.body.status ?? "").trim().toLowerCase();
  if (!ADMISSION_STATUS.includes(status as any)) throw ApiError.badRequest("Invalid status");
  const app = await AdmissionApplication.findOne({ where: { id: Number(req.params.id), ...branchWhere(req) } });
  if (!app) throw ApiError.notFound("Application not found");
  const reviewer = await User.findByPk(req.user!.id);
  if (!reviewer || !reviewer.isActive || (req.user?.branchId != null && Number(reviewer.branchId) !== Number(req.user.branchId))) {
    throw ApiError.forbidden("Reviewer is not active or does not belong to your branch");
  }
  await app.update({ status, reviewedBy: reviewer.id });
  ApiResponse.success(res, 200, `Application marked ${status}`, app);
}));

export default router;
