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
  if (!studentName) throw ApiError.badRequest("studentName is required");
  if (!appliedClass) throw ApiError.badRequest("appliedClass is required");
  if (!ADMISSION_STATUS.includes(status as any)) throw ApiError.badRequest("Invalid status");
  if (!Number.isFinite(dateApplied.getTime())) throw ApiError.badRequest("Invalid dateApplied");
  if (body.reviewedBy !== undefined && body.reviewedBy !== null) {
    const reviewer = await User.findOne({ where: { id: Number(body.reviewedBy), ...branchWhere(req) } });
    if (!reviewer || !reviewer.isActive) throw ApiError.badRequest("Reviewer does not belong to your branch or is inactive");
  }
  body.studentName = studentName;
  body.appliedClass = appliedClass;
  body.status = status;
  body.dateApplied = dateApplied;
  body.branchId = branchId;
  return body;
};

const base = createCrudController<AdmissionApplication>({
  model: AdmissionApplication,
  searchable: ["applicationNo", "studentName", "email", "phone"],
  defaultSort: [["dateApplied", "DESC"]],
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
  const applicationNo = String(body.applicationNo || `APP-${Date.now()}`).trim();
  delete body.applicationNo;
  const payload = await validateApplication({ ...body, applicationNo }, req);
  const app = await AdmissionApplication.create({ ...payload, applicationNo });
  ApiResponse.success(res, 201, "Application received", app);
}));

/** Transition an application's pipeline status. */
router.patch("/:id/status", authorize("admissions:update"), asyncHandler(async (req, res) => {
  const status = String(req.body.status);
  if (!ADMISSION_STATUS.includes(status as any)) throw ApiError.badRequest("Invalid status");
  const app = await AdmissionApplication.findOne({ where: { id: Number(req.params.id), ...branchWhere(req) } });
  if (!app) throw ApiError.notFound("Application not found");
  await app.update({ status, reviewedBy: req.user!.id });
  ApiResponse.success(res, 200, `Application marked ${status}`, app);
}));


export default router;