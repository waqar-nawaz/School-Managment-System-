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
import { assertStudentAccess, ownStudentIds, canSeeMedical } from "../../utils/access";
import { RefreshToken } from "../../models";
import { invalidateActiveCache } from "../../middlewares/authenticate";
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
  // Medical details only for admins/family (teachers etc. use health-records with its own permission).
  hideAttributes: (req: any) => (canSeeMedical(req.user?.role) ? [] : ["medicalInfo"]),
});

function stripMedical(req: any, student: any) {
  const json = typeof student.toJSON === "function" ? student.toJSON() : { ...student };
  if (!canSeeMedical(req.user?.role)) delete json.medicalInfo;
  return json;
}

/** Enable/disable the student's login together with the student record. */
async function setStudentLogin(student: Student, isActive: boolean, transaction?: any) {
  if (!student.userId) return;
  await User.update({ isActive }, { where: { id: student.userId }, transaction });
  if (!isActive) {
    await RefreshToken.update({ revoked: true, revokedAt: new Date() }, { where: { userId: student.userId, revoked: false }, transaction });
  }
  invalidateActiveCache(Number(student.userId));
}

async function assertSectionHasRoom(req: any, student: Student, sectionId: number, classId: number, transaction?: any) {
  const branchId = req.user?.branchId;
  const section = await Section.findOne({
    where: { id: sectionId, classId, ...(branchId != null ? { branchId } : {}), isActive: true }, transaction,
  });
  if (!section) throw ApiError.badRequest("Section is inactive or does not belong to the class");
  if (Number(section.capacity) > 0) {
    const activeCount = await Enrolment.count({
      where: { sectionId, status: "active", studentId: { [Op.ne]: student.id } }, transaction,
    });
    if (activeCount >= Number(section.capacity)) {
      throw ApiError.badRequest(`Section ${section.name} is full (capacity ${section.capacity})`);
    }
  }
}

async function reactivateStudent(req: any, student: Student, transaction?: any) {
  const classId = Number(student.currentClassId ?? 0);
  const sectionId = student.currentSectionId != null ? Number(student.currentSectionId) : null;
  if (classId && sectionId) await assertSectionHasRoom(req, student, sectionId, classId, transaction);
  await student.update({ isActive: true }, { transaction });
  await Enrolment.update({ status: "active" }, { where: { studentId: student.id, status: "withdrawn" }, transaction });
  await setStudentLogin(student, true, transaction);
}

async function deactivateStudent(student: Student, transaction?: any) {
  // Release the seat so capacity checks free up.
  await Enrolment.update({ status: "withdrawn" }, { where: { studentId: student.id, status: "active" }, transaction });
  await student.update({ isActive: false }, { transaction });
  await setStudentLogin(student, false, transaction);
}

router.get("/", authorize("students:read"), asyncHandler(async (req, res) => {
  // Parents see their children, students see themselves; staff see the branch (paginated).
  if (req.user?.role === "parent" || req.user?.role === "student") {
    const ids = (await ownStudentIds(req)) ?? [];
    const rows = ids.length ? await Student.findAll({ where: { id: ids }, include: [{ association: "enrolments" }] }) : [];
    return ApiResponse.success(res, 200, "List fetched", rows);
  }
  return base.list(req, res);
}));

router.get("/inactive", authorize("students:update"), asyncHandler(async (req, res) => {
  // For super_admin (branchId=null), don't filter by branchId — show all branches.
  const branchFilter = req.user?.branchId != null ? { branchId: req.user.branchId } : {};
  const rows = await Student.findAll({
    where: { ...branchFilter, isActive: false },
    include: [{ association: "enrolments" }],
    order: [["admissionNo", "ASC"]],
  });
  ApiResponse.success(res, 200, "Inactive students", rows);
}));

router.get("/:id", authorize("students:read"), asyncHandler(async (req, res) => {
  const student = await assertStudentAccess(req, Number(req.params.id));
  ApiResponse.success(res, 200, "Fetched", stripMedical(req, student));
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
    // Student names are not unique. Admission number is the student identity.
    // The linked login account still needs unique email/username values.
    let email = providedEmail || `${slug}.${unique}@school.local`;
    let username = String(body.username || "").trim();
    if (!username) username = providedEmail ? providedEmail.split("@")[0] : `student_${unique}`;
    if (username.length < 3) username = `student_${unique}`;
    if (await User.findOne({ where: { email } })) email = `${slug}.${unique}@school.local`;
    if (await User.findOne({ where: { username } })) username = `${username}_${unique}`;

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
        // New admissions are always active. Deactivation is a separate lifecycle action.
        isActive: true,
        currentClassId, currentSectionId, medicalInfo: body.medicalInfo,
        userId: user.id, branchId,
      }, { transaction });

      // Guardians: reuse an existing parent (by id or phone) or create one. createUser() already
      // creates the Parent profile for role "parent", so we UPDATE that row instead of inserting a
      // second Parent for the same login (which broke the parent portal).
      let guardianIndex = 0;
      for (const g of guardians) {
        guardianIndex += 1;
        const gPhone = g.phone ? String(g.phone).trim() : "";
        let parent = g.id
          ? await Parent.findOne({ where: { id: g.id, branchId }, transaction })
          : (gPhone ? await Parent.findOne({ where: { phone: gPhone, branchId }, transaction }) : null);

        if (!parent) {
          const gName = String(g.fullName || g.name || "Guardian").trim() || "Guardian";
          const stamp = `${Date.now().toString(36)}${guardianIndex}${Math.floor(Math.random() * 1000)}`;
          const gEmail = g.email ? String(g.email).trim().toLowerCase() : "";
          const pUser = await createUser({
            username: `${gName.replace(/[^a-zA-Z0-9]+/g, "_").toLowerCase().slice(0, 40) || "parent"}_${stamp}`,
            email: gEmail && !(await User.findOne({ where: { email: gEmail }, transaction }))
              ? gEmail : `${slug}-p${guardianIndex}.${stamp}@school.local`,
            firstName: gName, lastName: "", role: "parent", phone: gPhone || undefined,
            branchId, sendWelcome: false, generatedBy: req.user!.id, transaction,
          });
          parent = await Parent.findOne({ where: { userId: pUser.id }, transaction });
          if (!parent) throw ApiError.internal("Parent profile was not created");
          await parent.update({
            fullName: gName, phone: gPhone || parent.phone, email: g.email ? String(g.email) : parent.email,
            relation: g.relation || "guardian", occupation: g.occupation, address: g.address,
          }, { transaction });
        }

        await StudentGuardian.findOrCreate({
          where: { studentId: student.id, parentId: parent.id },
          defaults: {
            studentId: student.id, parentId: parent.id,
            relation: g.relation || parent.relation || "guardian",
            isPrimary: g.isPrimary !== undefined ? !!g.isPrimary : guardianIndex === 1,
          } as any,
          transaction,
        });
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
              where: { sectionId: section.id, status: "active" },
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
            const yearName = year + "-" + (year + 1);
            const existingYearByName = await AcademicYear.findOne({
              where: { name: yearName, branchId },
              transaction,
            });
            if (existingYearByName) {
              academicYearId = existingYearByName.id;
            } else {
              const createdYear = await AcademicYear.create({
              name: yearName,
              startDate,
              endDate,
              isCurrent: true,
              isClosed: false,
              branchId,
              }, { transaction });
              academicYearId = createdYear.id;
            }
          }
        }

        await Enrolment.create({
          studentId: student.id, academicYearId, classId: currentClassId, branchId,
          sectionId: currentSectionId ?? null, enrolledOn: new Date(),
          status: "active", rollNo: body.rollNo,
        } as any, { transaction });
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
  if (patch.firstName !== undefined && !String(patch.firstName).trim()) throw ApiError.badRequest("firstName cannot be empty");
  if (patch.email && !/^\S+@\S+\.\S+$/.test(String(patch.email))) throw ApiError.badRequest("Invalid email");

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

  const wasActive = student.isActive === true;
  const wantsActive = patch.isActive === undefined ? undefined : patch.isActive === true || patch.isActive === "true";
  delete patch.isActive; // handled explicitly below so seat/login logic always runs
  const classTouched = patch.currentClassId !== undefined || patch.currentSectionId !== undefined;
  const branchId = req.user?.branchId ?? student.branchId;

  await sequelize.transaction(async (transaction) => {
    await student.update(patch, { transaction });

    if (wantsActive === false && wasActive) {
      await deactivateStudent(student, transaction);
    } else if (wantsActive === true && !wasActive) {
      await reactivateStudent(req, student, transaction);
    } else if (classTouched && newClassId && (wantsActive ?? wasActive)) {
      // Only touch the enrolment when class/section were actually edited.
      const academicYear =
        (await AcademicYear.findOne({ where: { isCurrent: true, branchId }, transaction })) ||
        (await AcademicYear.findOne({ where: { branchId }, order: [["startDate", "DESC"]], transaction }));
      if (academicYear) {
        const [enrolment] = await Enrolment.findOrCreate({
          where: { studentId: student.id, academicYearId: academicYear.id },
          defaults: {
            studentId: student.id, academicYearId: academicYear.id, classId: newClassId, branchId,
            sectionId: newSectionId ?? null, enrolledOn: new Date(), status: "active",
          } as any,
          transaction,
        });
        await enrolment.update({ classId: newClassId, branchId, sectionId: newSectionId ?? null, status: "active" }, { transaction });
      }
    }
  });

  ApiResponse.success(res, 200, "Student updated", student);
}));

router.delete("/:id", authorize("students:delete"), asyncHandler(async (req, res) => {
  const student = await assertStudentAccess(req, Number(req.params.id));
  await sequelize.transaction((transaction) => deactivateStudent(student, transaction));
  await writeAuditLog({
    action: "update", entity: "student", entityId: student.id, userId: req.user!.id,
    role: req.user!.role, ip: req.ip, newData: { isActive: false },
  });
  ApiResponse.success(res, 200, "Student deactivated", null);
}));

router.patch("/:id/reactivate", authorize("students:update"), asyncHandler(async (req, res) => {
  const student = await assertStudentAccess(req, Number(req.params.id));
  if (student.isActive) return ApiResponse.success(res, 200, "Student is already active", student);
  await sequelize.transaction((transaction) => reactivateStudent(req, student, transaction));
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

router.get("/:id/fees", authorize("fees:read", "invoices:read"), asyncHandler(async (req, res) => {
  const student = await assertStudentAccess(req, Number(req.params.id));
  const invoices = await Invoice.findAll({
    where: { studentId: student.id }, include: [{ association: "payments" }],
    order: [["issueDate", "DESC"]],
  });
  ApiResponse.success(res, 200, "Fee summary", invoices);
}));

export default router;
