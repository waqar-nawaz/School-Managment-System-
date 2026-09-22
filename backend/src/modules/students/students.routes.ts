import { Router } from "express";
import { Op } from "sequelize";
import { authenticate } from "../../middlewares/authenticate";
import { authorize } from "../../middlewares/authorize";
import asyncHandler from "../../utils/asyncHandler";
import { ApiResponse } from "../../utils/ApiResponse";
import { ApiError } from "../../utils/ApiError";
import { Student, Parent, StudentGuardian, Enrolment, AcademicYear, User, Attendance, Invoice } from "../../models";
import { createCrudController } from "../../utils/crudFactory";
import { createUser } from "../users/users.service";
import { writeAuditLog } from "../../services/audit.service";

const router = Router();
router.use(authenticate);

const base = createCrudController<Student>({
  model: Student,
  searchable: ["firstName", "lastName", "admissionNo", "email"],
  defaultSort: [["admissionNo", "ASC"]],
  includes: [{ association: "enrolments" }],
});

router.get("/", authorize("students:read"), (req, res, next) => base.list(req, res).catch(next));
router.get("/:id", authorize("students:read"), (req, res, next) => base.getOne(req, res).catch(next));

/** Full admission flow: creates user account + student + optional guardians + enrolment. */
router.post(
  "/",
  authorize("students:create"),
  asyncHandler(async (req, res) => {
    const body = req.body;
    const { guardians } = body as { guardians?: any[] };

    const user = await createUser({
      username: body.username || body.email.split("@")[0],
      email: body.email,
      firstName: body.firstName,
      lastName: body.lastName,
      role: "student",
      gender: body.gender,
      phone: body.phone,
      branchId: body.branchId,
      sendWelcome: true,
      generatedBy: req.user!.id,
    });

    const student = await Student.create({
      admissionNo: body.admissionNo || `STU-${Date.now()}`,
      firstName: body.firstName,
      lastName: body.lastName,
      dateOfBirth: body.dateOfBirth,
      gender: body.gender,
      bloodGroup: body.bloodGroup,
      nationality: body.nationality,
      emergencyContact: body.emergencyContact,
      address: body.address,
      email: body.email,
      admissionDate: body.admissionDate || new Date(),
      admissionStatus: "admitted",
      currentClassId: body.currentClassId,
      currentSectionId: body.currentSectionId,
      medicalInfo: body.medicalInfo,
      userId: user.id,
      branchId: body.branchId,
    });

    if (Array.isArray(guardians)) {
      for (const g of guardians) {
        let parent = g.id ? await Parent.findByPk(g.id) : await Parent.findOne({ where: { phone: g.phone } });
        if (!parent) {
          const pUser = await createUser({
            username: `${g.fullName.replace(/\s+/g, "_").toLowerCase()}_${Date.now()}`,
            email: g.email || `${student.admissionNo}-p@school.local`,
            firstName: g.fullName,
            lastName: "",
            role: "parent",
            phone: g.phone,
            sendWelcome: false,
            generatedBy: req.user!.id,
          });
          parent = await Parent.create({
            fullName: g.fullName, phone: g.phone, email: g.email, relation: g.relation || "guardian",
            occupation: g.occupation, address: g.address, userId: pUser.id,
          });
        }
        await StudentGuardian.create({ studentId: student.id, parentId: parent.id, relation: parent.relation, isPrimary: !!g.isPrimary });
      }
    }

    if (body.currentClassId) {
      let academicYearId: number | undefined = body.academicYearId;
      if (!academicYearId) {
        const currentYear =
          (await AcademicYear.findOne({ where: { isCurrent: true } })) ||
          (await AcademicYear.findOne({ order: [["startDate", "DESC"]] }));
        academicYearId = currentYear?.id;
      }
      if (!academicYearId) throw ApiError.badRequest("No academic year configured; create one first");

      await Enrolment.create({
        studentId: student.id,
        academicYearId,
        classId: body.currentClassId,
        sectionId: body.currentSectionId ?? null,
        enrolledOn: new Date(),
        status: "active",
        rollNo: body.rollNo,
      });
    }

    await writeAuditLog({ action: "create", entity: "student", entityId: student.id, userId: req.user!.id, role: req.user!.role, ip: req.ip, newData: { admissionNo: student.admissionNo } });
    ApiResponse.success(res, 201, "Student admitted", student);
  })
);

router.put("/:id", authorize("students:update"), asyncHandler(async (req, res) => {
  const student = await Student.findByPk(req.params.id);
  if (!student) throw ApiError.notFound("Student not found");
  await student.update(req.body);
  ApiResponse.success(res, 200, "Student updated", student);
}));

router.delete("/:id", authorize("students:delete"), asyncHandler(async (req, res) => {
  const student = await Student.findByPk(req.params.id);
  if (!student) throw ApiError.notFound("Student not found");
  await student.update({ isActive: false });
  ApiResponse.success(res, 200, "Student deactivated", null);
}));

/** Guardians associated with a student. */
router.get("/:id/guardians", authorize("students:read"), asyncHandler(async (req, res) => {
  const student = await Student.findByPk(req.params.id, {
    include: [{ association: "guardians" }],
  });
  if (!student) throw ApiError.notFound("Student not found");
  ApiResponse.success(res, 200, "Guardians", (student as any).guardians || []);
}));

/** Latest attendance summary for a student. */
router.get("/:id/attendance", authorize("attendance:read", "students:read"), asyncHandler(async (req, res) => {
  const month = String(req.query.month || new Date().toISOString().slice(0, 7));
  const rows = await Attendance.findAll({
    where: { studentId: req.params.id, date: { [Op.like]: `${month}%` } },
  });
  const summary: Record<string, number> = {};
  for (const r of rows) summary[r.status] = (summary[r.status] || 0) + 1;
  ApiResponse.success(res, 200, "Attendance", { month, summary, records: rows });
}));

/** Fee summary: invoices + payments for a student. */
router.get("/:id/fees", authorize("students:read"), asyncHandler(async (req, res) => {
  const invoices = await Invoice.findAll({
    where: { studentId: req.params.id },
    include: [{ association: "payments" }],
    order: [["issueDate", "DESC"]],
  });
  ApiResponse.success(res, 200, "Fee summary", invoices);
}));

export default router;