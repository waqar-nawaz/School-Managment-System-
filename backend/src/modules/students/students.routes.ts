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
  defaultWhere: { isActive: true },
});

async function assertStudentAccess(req: any, studentId: number): Promise<Student> {
  const student = await Student.findByPk(studentId);
  if (!student) throw ApiError.notFound("Student not found");

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

router.get("/inactive", authorize("students:read"), asyncHandler(async (req, res) => {
  if (req.user?.role === "parent") throw ApiError.forbidden("Parents cannot access inactive students");
  const rows = await Student.findAll({
    where: { branchId: req.user?.branchId, isActive: false },
    include: [{ association: "enrolments" }],
    order: [["admissionNo", "ASC"]],
  });
  ApiResponse.success(res, 200, "Inactive students", rows);
}));

router.get("/:id", authorize("students:read"), asyncHandler(async (req, res) => {
  const student = await assertStudentAccess(req, Number(req.params.id));
  ApiResponse.success(res, 200, "Fetched", student);
}));

router.post(
  "/",
  authorize("students:create"),
  asyncHandler(async (req, res) => {
    const body = req.body;
    const guardians: any[] = Array.isArray(body.guardians) ? [...body.guardians] : [];
    if (body.guardianName || body.guardianPhone) {
      guardians.push({ fullName: body.guardianName || "Guardian", phone: body.guardianPhone, relation: "guardian" });
    }

    const firstName = String(body.firstName || "").trim();
    const lastName = String(body.lastName || "").trim();
    const branchId = Number(req.user?.branchId);
    if (!Number.isInteger(branchId) || branchId <= 0) throw ApiError.badRequest("User is not assigned to a branch");
    if (!firstName) throw ApiError.badRequest("firstName is required");
    if (firstName.length > 120 || lastName.length > 120) throw ApiError.badRequest("Student name is too long");
    const admissionNo = String(body.admissionNo || `STU-${Date.now()}`).trim();
    const duplicateAdmission = await Student.findOne({ where: { admissionNo } });
    if (duplicateAdmission) throw ApiError.conflict("Admission number already exists");
    const providedEmail = body.email ? String(body.email).trim().toLowerCase() : "";
    if (providedEmail && !/^\S+@\S+\.\S+$/.test(providedEmail)) throw ApiError.badRequest("Invalid email");
    const slug = String(admissionNo).toLowerCase().replace(/[^a-z0-9]+/g, "") || "student";
    const unique = `${Date.now().toString(36)}${Math.floor(Math.random() * 10000)}`;
    const email = providedEmail || `${slug}.${unique}@school.local`;
    let username = String(body.username || "").trim();
    if (!username) username = providedEmail ? providedEmail.split("@")[0] : `student_${unique}`;
    if (username.length < 3) username = `student_${unique}`;

    const dob = body.dateOfBirth ?? body.dob;
    const currentClassId = body.currentClassId ?? body.classId;
    const currentSectionId = body.currentSectionId ?? body.sectionId;

    if (currentClassId) {
      const schoolClass = await SchoolClass.findOne({ where: { id: Number(currentClassId), branchId } });
      if (!schoolClass || !schoolClass.isActive) throw ApiError.badRequest("Selected class is inactive or outside your branch");
      if (currentSectionId) {
        const section = await Section.findOne({ where: { id: Number(currentSectionId), branchId } });
        if (!section || !section.isActive || Number(section.classId) !== Number(currentClassId)) {
          throw ApiError.badRequest("Selected section does not belong to the selected class");
        }
      }
    }

    const result = await sequelize.transaction(async (transaction) => {
      const user = await createUser({
        username, email, firstName, lastName, role: "student",
        gender: body.gender, phone: body.phone ?? body.guardianPhone,
        branchId, sendWelcome: !!providedEmail,
        generatedBy: req.user!.id, transaction,
      });

      const student = await Student.create({
        admissionNo, firstName, lastName, dateOfBirth: dob, gender: body.gender,
        bloodGroup: body.bloodGroup, nationality: body.nationality,
        emergencyContact: body.emergencyContact, guardianName: body.guardianName,
        guardianPhone: body.guardianPhone, address: body.address, email: body.email,
        admissionDate: body.admissionDate || new Date(), admissionStatus: "admitted",
        currentClassId, currentSectionId, medicalInfo: body.medicalInfo,
        userId: user.id, branchId,
      }, { transaction });

      if (guardians.length) {
        for (const g of guardians) {
          let parent = g.id
            ? await Parent.findOne({
                where: { id: g.id },
                include: [{ model: User, where: { branchId: req.user?.branchId }, required: true }],
                transaction,
              })
            : await Parent.findOne({
                where: { phone: g.phone },
                include: [{ model: User, where: { branchId: req.user?.branchId }, required: true }],
                transaction,
              });

          if (!parent) {
            const gName = String(g.fullName || g.name || "Guardian").trim() || "Guardian";
            const pUser = await createUser({
              username: `${gName.replace(/\s+/g, "_").toLowerCase()}_${Date.now()}`,
              email: g.email || `${student.admissionNo}-p@school.local`,
              firstName: gName, lastName: "", role: "parent", phone: g.phone,
              branchId,
              sendWelcome: false, generatedBy: req.user!.id, transaction,
            });
            parent = await Parent.create({
              fullName: gName, phone: g.phone, email: g.email, branchId,
              relation: g.relation || "guardian", occupation: g.occupation,
              address: g.address, userId: pUser.id,
            }, { transaction });
          }

          await StudentGuardian.create({
            studentId: student.id, parentId: parent.id,
            relation: parent.relation, isPrimary: !!g.isPrimary,
          }, { transaction });
        }
      }

      if (currentClassId) {
        if (currentSectionId) {
          const section = await Section.findOne({
            where: { id: Number(currentSectionId), classId: Number(currentClassId), branchId, isActive: true },
            transaction,
          });
          if (!section) throw ApiError.badRequest("Selected section is inactive or does not belong to the selected class");
          if (Number(section.capacity) > 0) {
            const activeCount = await Enrolment.count({
              where: { sectionId: section.id, branchId, status: "active" },
              transaction,
            });
            if (activeCount >= Number(section.capacity)) {
              throw ApiError.badRequest("Section " + section.name + " is full (capacity " + section.capacity + ")");
            }
          }
        }

        let academicYearId: number | undefined = body.academicYearId;
        if (academicYearId) {
          const selectedYear = await AcademicYear.findOne({ where: { id: Number(academicYearId), branchId }, transaction });
          if (!selectedYear) throw ApiError.badRequest("Selected academic year is not configured for your branch");
          academicYearId = selectedYear.id;
        } else {
          const currentYear =
            (await AcademicYear.findOne({ where: { isCurrent: true, branchId }, transaction })) ||
            (await AcademicYear.findOne({ where: { branchId }, order: [["startDate", "DESC"]], transaction }));
          if (currentYear) {
            academicYearId = currentYear.id;
          } else {
            // Bootstrap the first academic year so student admission does not fail
            // just because the setup wizard has not created one yet.
            const admissionDate = new Date(body.admissionDate || new Date());
            const year = admissionDate.getMonth() >= 6 ? admissionDate.getFullYear() : admissionDate.getFullYear() - 1;
            const startDate = new Date(year, 6, 1);
            const endDate = new Date(year + 1, 5, 30);
            const createdYear = await AcademicYear.create({
              name: year + "-" + (year + 1),
              startDate,
              endDate,
              isCurrent: true,
              isClosed: false,
              branchId,
            }, { transaction });
            academicYearId = createdYear.id;
          }
        }

        await Enrolment.create({
          studentId: student.id, academicYearId, classId: currentClassId,
          sectionId: currentSectionId ?? null, enrolledOn: new Date(),
          status: "active", rollNo: body.rollNo,
        }, { transaction });
      }

      return student;
    });

    await writeAuditLog({
      action: "create", entity: "student", entityId: result.id, userId: req.user!.id,
      role: req.user!.role, ip: req.ip, newData: { admissionNo: result.admissionNo },
    });
    ApiResponse.success(res, 201, "Student admitted", result);
  })
);

router.put("/:id", authorize("students:update"), asyncHandler(async (req, res) => {
  const student = await assertStudentAccess(req, Number(req.params.id));
  const b = req.body as Record<string, unknown>;
  const allowed = [
    "firstName", "lastName", "dateOfBirth", "gender", "bloodGroup", "nationality",
    "emergencyContact", "guardianName", "guardianPhone", "address", "email",
    "admissionDate", "currentClassId", "currentSectionId", "medicalInfo", "isActive",
  ];
  const patch: Record<string, unknown> = {};
  for (const key of allowed) if (b[key] !== undefined) patch[key] = b[key];

  if (b.dob !== undefined && b.dateOfBirth === undefined) patch.dateOfBirth = b.dob;
  if (b.classId !== undefined && b.currentClassId === undefined) patch.currentClassId = b.classId;
  if (b.sectionId !== undefined && b.currentSectionId === undefined) patch.currentSectionId = b.sectionId;

  const newClassId = patch.currentClassId !== undefined
    ? Number(patch.currentClassId) : Number(student.currentClassId ?? 0);
  const newSectionId = patch.currentSectionId !== undefined
    ? (patch.currentSectionId === null || patch.currentSectionId === "" ? null : Number(patch.currentSectionId))
    : (student.currentSectionId ?? null);

  if (newClassId) {
    const schoolClass = await SchoolClass.findByPk(newClassId);
    if (!schoolClass || !schoolClass.isActive) throw ApiError.badRequest("Class not found or inactive");
    if (req.user?.branchId != null && Number(schoolClass.branchId) !== Number(req.user.branchId)) {
      throw ApiError.badRequest("Selected class does not belong to your branch");
    }
    if (newSectionId != null) {
      const section = await Section.findByPk(newSectionId);
      if (!section || !section.isActive) throw ApiError.badRequest("Section not found or inactive");
      if (Number(section.classId) !== newClassId || Number(section.branchId) !== Number(req.user?.branchId)) {
        throw ApiError.badRequest("Selected section does not belong to the selected class or branch");
      }
      const activeCount = await Enrolment.count({
        where: { sectionId: newSectionId, branchId: req.user?.branchId, status: "active", studentId: { [Op.ne]: student.id } },
      });
      if (Number(section.capacity) > 0 && activeCount >= Number(section.capacity)) {
        throw ApiError.badRequest("Section " + section.name + " is full (capacity " + section.capacity + ")");
      }
    }
  }

  await student.update(patch);

  if (newClassId) {
    const academicYear =
      (await AcademicYear.findOne({ where: { isCurrent: true, branchId: req.user?.branchId } })) ||
      (await AcademicYear.findOne({ where: { branchId: req.user?.branchId }, order: [["startDate", "DESC"]] }));
    if (academicYear) {
      const [enrolment] = await Enrolment.findOrCreate({
        where: { studentId: student.id, academicYearId: academicYear.id },
        defaults: {
          studentId: student.id, academicYearId: academicYear.id, classId: newClassId,
          sectionId: newSectionId ?? null, enrolledOn: new Date(), status: "active",
        },
      });
      await enrolment.update({ classId: newClassId, sectionId: newSectionId ?? null, status: "active" });
    }
  }

  ApiResponse.success(res, 200, "Student updated", student);
}));

router.delete("/:id", authorize("students:delete"), asyncHandler(async (req, res) => {
  const student = await assertStudentAccess(req, Number(req.params.id));
  await student.update({ isActive: false });
  ApiResponse.success(res, 200, "Student deactivated", null);
}));

router.patch("/:id/reactivate", authorize("students:update"), asyncHandler(async (req, res) => {
  const student = await assertStudentAccess(req, Number(req.params.id));
  if (student.isActive) return ApiResponse.success(res, 200, "Student is already active", student);

  const classId = Number(student.currentClassId ?? 0);
  const sectionId = student.currentSectionId != null ? Number(student.currentSectionId) : null;
  if (classId && sectionId) {
    const section = await Section.findOne({
      where: { id: sectionId, classId, branchId: req.user?.branchId, isActive: true },
    });
    if (!section) throw ApiError.badRequest("Student's current section is inactive or no longer belongs to the class");
    if (Number(section.capacity) > 0) {
      const activeCount = await Enrolment.count({
        where: { sectionId, branchId: req.user?.branchId, status: "active" },
      });
      if (activeCount >= Number(section.capacity)) {
        throw ApiError.badRequest("Section " + section.name + " is full (capacity " + section.capacity + ")");
      }
    }
  }

  await student.update({ isActive: true });
  await writeAuditLog({
    action: "update", entity: "student", entityId: student.id, userId: req.user!.id,
    role: req.user!.role, ip: req.ip, newData: { isActive: true },
  });
  ApiResponse.success(res, 200, "Student reactivated", student);
}));

router.get("/:id/guardians", authorize("students:read"), asyncHandler(async (req, res) => {
  const student = await assertStudentAccess(req, Number(req.params.id));
  await student.reload({ include: [{ association: "guardians" }] });
  ApiResponse.success(res, 200, "Guardians", (student as any).guardians || []);
}));

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

router.get("/:id/fees", authorize("students:read"), asyncHandler(async (req, res) => {
  await assertStudentAccess(req, Number(req.params.id));
  const invoices = await Invoice.findAll({
    where: { studentId: req.params.id }, include: [{ association: "payments" }],
    order: [["issueDate", "DESC"]],
  });
  ApiResponse.success(res, 200, "Fee summary", invoices);
}));

export default router;
