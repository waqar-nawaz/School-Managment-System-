import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate";
import { authorize } from "../../middlewares/authorize";
import asyncHandler from "../../utils/asyncHandler";
import { ApiResponse } from "../../utils/ApiResponse";
import { ApiError } from "../../utils/ApiError";
import { AdmissionApplication } from "../../models";
import { createCrudController } from "../../utils/crudFactory";
import { ADMISSION_STATUS } from "../../utils/constants";

const router = Router();
router.use(authenticate);

const base = createCrudController<AdmissionApplication>({
  model: AdmissionApplication,
  searchable: ["applicationNo", "studentName", "email", "phone"],
  defaultSort: [["dateApplied", "DESC"]],
});

router.get("/", authorize("admissions:read"), (req, res, next) => base.list(req, res).catch(next));
router.get("/:id", authorize("admissions:read"), (req, res, next) => base.getOne(req, res).catch(next));
router.put("/:id", authorize("admissions:update"), (req, res, next) => base.update(req, res).catch(next));
router.delete("/:id", authorize("admissions:delete"), (req, res, next) => base.remove(req, res).catch(next));

router.post("/", authorize("admissions:create"), asyncHandler(async (req, res) => {
  const app = await AdmissionApplication.create({
    applicationNo: req.body.applicationNo || `APP-${Date.now()}`,
    ...req.body,
    dateApplied: req.body.dateApplied || new Date(),
  });
  ApiResponse.success(res, 201, "Application received", app);
}));

/** Transition an application's pipeline status. */
router.patch("/:id/status", authorize("admissions:update"), asyncHandler(async (req, res) => {
  const status = String(req.body.status);
  if (!ADMISSION_STATUS.includes(status as any)) throw ApiError.badRequest("Invalid status");
  const app = await AdmissionApplication.findByPk(req.params.id);
  if (!app) throw ApiError.notFound("Application not found");
  await app.update({ status, reviewedBy: req.user!.id });
  ApiResponse.success(res, 200, `Application marked ${status}`, app);
}));

router.get("/stats/pipeline", authorize("admissions:read"), asyncHandler(async (_req, res) => {
  const apps = await AdmissionApplication.findAll({ attributes: ["status"] });
  const pipeline: Record<string, number> = {};
  for (const a of apps) pipeline[a.status] = (pipeline[a.status] || 0) + 1;
  ApiResponse.success(res, 200, "Admission pipeline", pipeline);
}));

export default router;