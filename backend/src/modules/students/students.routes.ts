import { Router } from "express";
import { Op } from "sequelize";
import { sequelize } from "../../database/sequelize";
import { authenticate } from "../../middlewares/authenticate";
import { authorize } from "../../middlewares/authorize";
import asyncHandler from "../../utils/asyncHandler";
import { ApiResponse } from "../../utils/ApiResponse";
import { ApiError } from "../../utils/ApiError";
import { Student, Parent, StudentGuardian, Enrolment, AcademicYear, User, Attendance, Invoice, SchoolClass, Section } from "../../models";
import { createCrudController } from "../../utils/crudFactory";
import { createUser } from "../users/users.service";
import { writeAuditLog } from "../../services/audit.service";
import { monthRange } from "../../utils/dateRange";

const router = Router();
router.use(authenticate);

const base = createCrudController<Student>({
  model: Student,
  searchable: ["firstName", "lastName", "admissionNo", "email"],
  defaultSort: [["admissionNo", "ASC"]],
  includes: [{ association: "enrolments" }],
});

async function assertStudentAccess(req: any, studentId: number): Promise<Student> {
  const student = await Student.findByPk(studentId);
  if (!student) throw ApiError.notFound("Student not found");

  // Parents may access only their linked wards; other roles remain branch-scoped.
  if (req.user?.role === "parent") {
    const parent = await Parent.findOne({ where: { userId: req.user.id } });
    if (!parent) throw ApiError.forbidden("Parent profile not found");
    const link = await StudentGuardian.findOne({ where: { parentId: parent.id, studentId } });
    if (!link) throw ApiError.forbidden("You can only access your linked students");
  } else if (req.user?.branchId != null && Number(student.branchId) !== Number(req.user.branchId)) {
    throw ApiError.notFound("Student not found");
  }
  return student;
}

router.get("/", authorize("students:read"), asyncHandler(async (req, res) => {
  if (req.user?.role === "parent") {
    const parent = await Parent.findOne({ where: { userId: req.user.id } });
    if (!parent) throw ApiError.forbidden("Parent profile not found");
    const links = await StudentGuardian.findAll({ where: { parentId: parent.id }, attributes: ["studentId"] });
    const ids = links.map(x => Number(x.studentId));
    const rows = ids.length ? await Student.findAll({ where: { id: ids }, include: [{ association: "enrolments" }] }) : [];
    return ApiResponse.success(res, 200, "List fetched", rows);
  }
  return base.list(req, res);
}));

router.get("/:id", authorize("students:read"), asyncHandler(async (req, res) => {
  const student = await assertStudentAccess(req, Number(req.params.id));
  ApiResponse.success(res, 200, "Fetched", student);
}));

/** Full admission flow: creates user account + student + optional guardians + enrolment. */
router.post(
  "/",
  authorize("students:create"),
  asyncHandler(async (req, res) => {
    const body = req.body;
    const guardians: any[] = Array.isArray(body.guardians) ? [...body.guardians] : [];
    // The form may send a single guardian as guardianName / guardianPhone.
    if (body.guardianName || body.guardianPhone) {
      guardians.push({
        fullName: body.guardianName || "Guardian",
        phone: body.guardianPhone,
        relation: "guardian",
      });
    }

    const firstName = body.firstName || "Student";
    const lastName = body.lastName || "";
    const admissionNo = body.admissionNo || `STU-${Date.now()}`;
    // When no email is given, generate a unique placeholder (derived from the
    // admission number) so two students never collide on the same address.
    const providedEmail = body.email ? String(body.email).trim() : "";
    const slug = String(admissionNo).toLowerCase().replace(/[^a-z0-9]+/g, "") || "student";
    const unique = `${Date.now().toString(36)}${Math.floor(Math.random() * 10000)}`;
    const email = providedEmail || `${slug}.${unique}@school.local`;
    let username = String(body.username || "").trim();
    if (!username) {
      username = providedEmail ? providedEmail.split("@")[0] : `student_${unique}`;
    }
    if (username.length < 3) username = `student_${unique}`;

    // Accept both naming conventions (form: dob/classId/sectionId).
    const dob = body.dateOfBirth ?? body.dob;
    const currentClassId = body.currentClassId ?? body.classId;
    const currentSectionId = body.currentSectionId ?? body.sectionId;

    const user = await createUser({
      username,
      email,
      firstName,
      lastName,
      role: "student",
      gender: body.gender,
      phone: body.phone ?? body.guardianPhone,
      branchId: req.user?.branchId ?? undefined,
      sendWelcome: !!body.email,
      generatedBy: req.user!.id,
    });

    const student = await Student.create({
      admissionNo,
      firstName,
      lastName,
      dateOfBirth: dob,
      gender: body.gender,
      bloodGroup: body.bloodGroup,
      nationality: body.nationality,
      emergencyContact: body.emergencyContact,
      guardianName: body.guardianName,
      guardianPhone: body.guardianPhone,
      address: body.address,
      email: body.email,
      admissionDate: body.admissionDate || new Date(),
      admissionStatus: "admitted",
      currentClassId,
      currentSectionId,
      medicalInfo: body.medicalInfo,
      userId: user.id,
      branchId: req.user!.branchId,
    });

    if (guardians.length) {
      for (const g of guardians) {
        let parent = g.id ? await Parent.findByPk(g.id) : await Parent.findOne({ where: { phone: g.phone } });
        if (!parent) {
          const gName = String(g.fullName || g.name || "Guardian").trim() || "Guardian";
          const pUser = await createUser({
            username: `${gName.replace(/\s+/g, "_").toLowerCase()}_${Date.now()}`,
            email: g.email || `${student.admissionNo}-p@school.local`,
            firstName: gName,
            lastName: "",
            role: "parent",
            phone: g.phone,
            sendWelcome: false,
            generatedBy: req.user!.id,
          });
          parent = await Parent.create({
            fullName: gName, phone: g.phone, email: g.email, relation: g.relation || "guardian",
            occupation: g.occupation, address: g.address, userId: pUser.id,
          });
        }
        await StudentGuardian.create({ studentId: student.id, parentId: parent.id, relation: parent.relation, isPrimary: !!g.isPrimary });
      }
    }

    if (currentClassId) {
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
        classId: currentClassId,
        sectionId: currentSectionId ?? null,
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
  const student = await assertStudentAccess(req, Number(req.params.id));
  const b = req.body as Record<string, unknown>;
  // Only allow student profile fields here. Sensitive ownership fields such as
  // branchId, userId, admissionStatus and admissionNo must not be client-controlled.
  const allowed = [
    "firstName", "lastName", "dateOfBirth", "gender", "bloodGroup", "nationality",
    "emergencyContact", "guardianName", "guardianPhone", "address", "email",
    "admissionDate", "currentClassId", "currentSectionId", "medicalInfo", "isActive",
  ];
  const patch: Record<string, unknown> = {};
  for (const key of allowed) if (b[key] !== undefined) patch[key] = b[key];

  // Accept both form keys (dob/classId/sectionId) and model keys.
  if (b.dob !== undefined && b.dateOfBirth === undefined) patch.dateOfBirth = b.dob;
  if (b.classId !== undefined && b.currentClassId === undefined) patch.currentClassId = b.classId;
  if (b.sectionId !== undefined && b.currentSectionId === undefined) patch.currentSectionId = b.sectionId;

  const newClassId = patch.currentClassId !== undefined
    ? Number(patch.currentClassId)
    : Number(student.currentClassId ?? 0);
  const newSectionId = patch.currentSectionId !== undefined
    ? (patch.currentSectionId === null || patch.currentSectionId === "" ? null : Number(patch.currentSectionId))
    : (student.currentSectionId ?? null);

  if (newClassId) {
    const schoolClass = await SchoolClass.findByPk(newClassId);
    if (!schoolClass) throw ApiError.badRequest("Class not found");
    if (req.user?.branchId != null && Number(schoolClass.branchId) !== Number(req.user.branchId)) {
      throw ApiError.badRequest("Selected class does not belong to your branch");
    }
    if (newSectionId != null) {
      const section = await Section.findByPk(newSectionId);
      if (!section) throw ApiError.badRequest("Section not found");
      if (Number(section.classId) !== newClassId) {
        throw ApiError.badRequest("Selected section does not belong to the selected class");
      }
    }
  }

  await student.update(patch);

  // Attendance is driven by active enrolments, so keep the current-year
  // enrolment in sync when the class/section is changed here.
  if (newClassId) {
    const academicYear =
      (await AcademicYear.findOne({ where: { isCurrent: true } })) ||
      (await AcademicYear.findOne({ order: [["startDate", "DESC"]] }));
    if (academicYear) {
      const [enrolment] = await Enrolment.findOrCreate({
        where: { studentId: student.id, academicYearId: academicYear.id },
        defaults: {
          studentId: student.id,
          academicYearId: academicYear.id,
          classId: newClassId,
          sectionId: newSectionId ?? null,
          enrolledOn: new Date(),
          status: "active",
        },
      });
      await enrolment.update({
        classId: newClassId,
        sectionId: newSectionId ?? null,
        status: "active",
      });
    }
  }

  ApiResponse.success(res, 200, "Student updated", student);
}));

router.delete("/:id", authorize("students:delete"), asyncHandler(async (req, res) => {
  const student = await assertStudentAccess(req, Number(req.params.id));
  await student.update({ isActive: false });
  ApiResponse.success(res, 200, "Student deactivated", null);
}));

/** Guardians associated with a student. */
router.get("/:id/guardians", authorize("students:read"), asyncHandler(async (req, res) => {
  const student = await assertStudentAccess(req, Number(req.params.id));
  await student.reload({ include: [{ association: "guardians" }] });
  ApiResponse.success(res, 200, "Guardians", (student as any).guardians || []);
}));

/** Latest attendance summary for a student. */
router.get("/:id/attendance", authorize("attendance:read", "students:read"), asyncHandler(async (req, res) => {
  const month = String(req.query.month || new Date().toISOString().slice(0, 7));
  const { start, end } = monthRange(month);
  const rows = await Attendance.findAll({
    where: { studentId: (await assertStudentAccess(req, Number(req.params.id))).id, date: { [Op.gte]: start, [Op.lt]: end } },
  });
  const summary: Record<string, number> = {};
  for (const r of rows) summary[r.status] = (summary[r.status] || 0) + 1;
  ApiResponse.success(res, 200, "Attendance", { month, summary, records: rows });
}));

/** Fee summary: invoices + payments for a student. */
router.get("/:id/fees", authorize("students:read"), asyncHandler(async (req, res) => {
  await assertStudentAccess(req, Number(req.params.id));
  const invoices = await Invoice.findAll({
    where: { studentId: req.params.id },
    include: [{ association: "payments" }],
    order: [["issueDate", "DESC"]],
  });
  ApiResponse.success(res, 200, "Fee summary", invoices);
}));

export default router;