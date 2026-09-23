import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate";
import { authorize } from "../../middlewares/authorize";
import asyncHandler from "../../utils/asyncHandler";
import { ApiResponse } from "../../utils/ApiResponse";
import { ApiError } from "../../utils/ApiError";
import { Certificate, Student } from "../../models";
import { createCrudController } from "../../utils/crudFactory";
import { CERTIFICATE_TYPES } from "../../utils/constants";

const router = Router();
router.use(authenticate);

const base = createCrudController<Certificate>({
  model: Certificate,
  searchable: ["certNo", "type", "title"],
  defaultSort: [["issuedOn", "DESC"]],
});

router.get("/", authorize("certificates:read"), (req, res, next) => base.list(req, res).catch(next));
router.get("/:id", authorize("certificates:read"), (req, res, next) => base.getOne(req, res).catch(next));
router.delete("/:id", authorize("certificates:delete"), (req, res, next) => base.remove(req, res).catch(next));

/**
 * Issue a certificate to a student. `body` may be provided; otherwise a
 * sensible default doc is generated from the student record.
 */
router.post("/", authorize("certificates:create"), asyncHandler(async (req, res) => {
  const { studentId, title, body, signedBy } = req.body;
  const type = req.body.type ?? req.body.certType;
  if (!CERTIFICATE_TYPES.includes(type as any)) {
    throw ApiError.badRequest(`Unknown certificate type. Allowed: ${CERTIFICATE_TYPES.join(", ")}`);
  }

  const student = await Student.findByPk(studentId);
  if (!student) throw ApiError.notFound("Student not found");

  const defaultBody = `This is to certify that ${student.firstName} ${student.lastName} (${student.admissionNo}) ${
    type === "bonafide" ? "is a bonafide student of this institution" :
    type === "character" ? "bears a good moral character" :
    "has satisfactorily completed the requirements"
  }.`;

  const cert = await Certificate.create({
    certNo: `CERT-${Date.now()}`,
    studentId,
    type,
    title: title || `${type.replace("_", " ")} certificate`,
    body: body || defaultBody,
    issuedOn: new Date(),
    signedBy: signedBy || "Principal",
    isVerified: false,
  });

  ApiResponse.success(res, 201, "Certificate issued", cert);
}));

router.put("/:id", authorize("certificates:update"), asyncHandler(async (req, res) => {
  const cert = await Certificate.findByPk(req.params.id);
  if (!cert) throw ApiError.notFound("Certificate not found");
  const { title, body, signedBy, studentId } = req.body;
  await cert.update({
    ...(title !== undefined ? { title } : {}),
    ...(body !== undefined ? { body } : {}),
    ...(signedBy !== undefined ? { signedBy } : {}),
    ...(studentId !== undefined ? { studentId } : {}),
  });
  ApiResponse.success(res, 200, "Certificate updated", cert);
}));

router.patch("/:id/verify", authorize("certificates:update"), asyncHandler(async (req, res) => {
  const cert = await Certificate.findByPk(req.params.id);
  if (!cert) throw ApiError.notFound("Certificate not found");
  await cert.update({ isVerified: Boolean(req.body.isVerified) });
  ApiResponse.success(res, 200, "Certificate updated", cert);
}));

router.get("/student/:studentId", authorize("certificates:read"), asyncHandler(async (req, res) => {
  const rows = await Certificate.findAll({
    where: { studentId: req.params.studentId },
    order: [["issuedOn", "DESC"]],
  });
  ApiResponse.success(res, 200, "Student certificates", rows);
}));

router.get("/verify/token/:certNo", authorize("certificates:read"), asyncHandler(async (req, res) => {
  const cert = await Certificate.findOne({
    where: { certNo: req.params.certNo },
    include: [{ association: "student", attributes: ["firstName", "lastName", "admissionNo"] }],
  });
  if (!cert) throw ApiError.notFound("Certificate not found");
  ApiResponse.success(res, 200, "Certificate", cert);
}));

export default router;