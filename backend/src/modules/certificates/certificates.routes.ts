import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate";
import { authorize } from "../../middlewares/authorize";
import asyncHandler from "../../utils/asyncHandler";
import { ApiResponse } from "../../utils/ApiResponse";
import { ApiError } from "../../utils/ApiError";
import { Certificate, Student, StudentGuardian } from "../../models";
import { createCrudController } from "../../utils/crudFactory";
import { CERTIFICATE_TYPES } from "../../utils/constants";
import { v4 as uuidv4 } from "uuid";
import { writeAuditLog } from "../../services/audit.service";

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
  // Cross-tenant guard: caller may only issue certificates for students in their own branch.
  const callerBranch = req.user!.branchId;
  if (callerBranch != null && Number(student.branchId) !== Number(callerBranch)) {
    throw ApiError.forbidden("Student does not belong to your branch");
  }

  const defaultBody = `This is to certify that ${student.firstName} ${student.lastName} (${student.admissionNo}) ${
    type === "bonafide" ? "is a bonafide student of this institution" :
    type === "character" ? "bears a good moral character" :
    "has satisfactorily completed the requirements"
  }.`;

  const cert = await Certificate.create({
    certNo: `CERT-${uuidv4().slice(0, 8).toUpperCase()}`,
    studentId,
    type,
    title: title || `${type.replace("_", " ")} certificate`,
    body: body || defaultBody,
    issuedOn: new Date(),
    signedBy: signedBy || "Principal",
    isVerified: false,
  });

  await writeAuditLog({
    action: "create",
    entity: "certificate",
    entityId: cert.id,
    userId: req.user!.id,
    role: req.user!.role,
    branchId: student.branchId,
    ip: req.ip,
    newData: { certNo: cert.certNo, type, studentId },
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
  const studentId = Number(req.params.studentId);
  if (!Number.isInteger(studentId) || studentId <= 0) throw ApiError.badRequest("Invalid studentId");
  const student = await Student.findByPk(studentId);
  if (!student) throw ApiError.notFound("Student not found");
  // Cross-tenant + parent-child guard.
  const callerBranch = req.user!.branchId;
  if (callerBranch != null && Number(student.branchId) !== Number(callerBranch)) {
    throw ApiError.forbidden("Student does not belong to your branch");
  }
  if (req.user!.role === "parent") {
    const link = await StudentGuardian.findOne({ where: { guardianId: req.user!.id, studentId } });
    if (!link) throw ApiError.forbidden("You can only view certificates for your own children");
  }
  const rows = await Certificate.findAll({
    where: { studentId },
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