/** Roles, branches and academic structure (years, terms, classes, sections, subjects, enrolments) */
import { Request } from "express";
import { ApiError } from "../../../utils/ApiError";
import { Op } from "sequelize";
import {
  Role,
  Permission,
  Branch,
  AcademicYear,
  Term,
  SchoolClass,
  Section,
  Subject,
  Student,
  ClassSubject,
  Enrolment,
  User,
} from "../../../models";
import { ResourceDefinition, getExisting } from "./shared";

const validateSubject = async (body: any, req: Request) => {
  const existing = await getExisting(Subject, req);
  const name = String(body.name ?? existing?.name ?? "").trim();
  const normalizedName = name.toLowerCase();
  const code = String(body.code ?? existing?.code ?? "").trim();
  const maxMarks = Number(body.maxMarks ?? existing?.maxMarks ?? 100);
  const passMarks = Number(body.passMarks ?? existing?.passMarks ?? 35);
  const isActive = body.isActive !== undefined ? Boolean(body.isActive) : Boolean(existing?.isActive ?? true);
  const branchId = Number(req.user?.branchId);

  if (!name) throw ApiError.badRequest("Subject name is required");
  if (!Number.isInteger(branchId) || branchId <= 0) throw ApiError.badRequest("User is not assigned to a branch");
  if (name.length > 120) throw ApiError.badRequest("Subject name must be 120 characters or fewer");
  if (code.length > 10) throw ApiError.badRequest("Subject code must be 10 characters or fewer");
  if (!Number.isInteger(maxMarks) || maxMarks <= 0) throw ApiError.badRequest("maxMarks must be a positive integer");
  if (!Number.isInteger(passMarks) || passMarks < 0 || passMarks > maxMarks) {
    throw ApiError.badRequest("passMarks must be between 0 and maxMarks");
  }

  const subjects = await Subject.findAll({
    where: {
      branchId,
      ...(existing?.id ? { id: { [Op.ne]: existing.id } } : {}),
    },
    attributes: ["id", "name"],
  });
  const duplicate = subjects.find(
    (subject) => String(subject.name ?? "").trim().toLowerCase() === normalizedName,
  );
  if (duplicate) throw ApiError.badRequest("Subject already exists in this branch");

  body.name = name;
  body.code = code || null;
  body.maxMarks = maxMarks;
  body.passMarks = passMarks;
  body.isActive = isActive;
  body.branchId = branchId;
  return body;
};

const validateSchoolClass = async (body: any, req: Request) => {
  const existing = await getExisting(SchoolClass, req);
  const branchId = req.user?.branchId;
  const name = String(body.name ?? existing?.name ?? "").trim();
  const level = String(body.level ?? existing?.level ?? "").trim();
  const capacity = Number(body.capacity ?? existing?.capacity ?? 0);
  const isActive = body.isActive !== undefined ? Boolean(body.isActive) : Boolean(existing?.isActive ?? true);
  if (!name) throw ApiError.badRequest("Class name is required");
  if (!Number.isInteger(capacity) || capacity < 0) throw ApiError.badRequest("Class capacity must be a non-negative integer");
  const duplicate = await SchoolClass.findOne({
    where: {
      name,
      ...(branchId != null ? { branchId } : {}),
      ...(existing?.id ? { id: { [Op.ne]: existing.id } } : {}),
    },
  });
  if (duplicate) throw ApiError.badRequest("Class already exists in this branch");
  body.name = name;
  body.level = level || null;
  body.capacity = capacity;
  body.isActive = isActive;
  body.branchId = branchId;
  return body;
};

const validateSection = async (body: any, req: Request) => {
  const existing = await getExisting(Section, req);
  const classId = Number(body.classId ?? existing?.classId);
  const name = String(body.name ?? existing?.name ?? "").trim();
  const normalizedName = name.toLowerCase();
  const capacity = Number(body.capacity ?? existing?.capacity ?? 0);
  const branchId = Number(req.user?.branchId);

  if (!Number.isInteger(classId) || classId <= 0 || !name) {
    throw ApiError.badRequest("classId and section name are required");
  }
  if (!Number.isInteger(branchId) || branchId <= 0) {
    throw ApiError.badRequest("User is not assigned to a branch");
  }

  const schoolClass = await SchoolClass.findOne({
    where: { id: classId, branchId },
  });
  if (!schoolClass || !schoolClass.isActive) {
    throw ApiError.badRequest("Class not found, inactive, or outside your branch");
  }
  if (!Number.isInteger(capacity) || capacity < 0) {
    throw ApiError.badRequest("Section capacity must be non-negative");
  }
  if (name.length > 20) {
    throw ApiError.badRequest("Section name must be 20 characters or fewer");
  }

  // Compare normalized names so A/a/ A  cannot create duplicates.
  const existingSections = await Section.findAll({
    where: {
      classId,
      branchId,
      ...(existing?.id ? { id: { [Op.ne]: existing.id } } : {}),
    },
    attributes: ["id", "name"],
  });
  const duplicate = existingSections.find(
    (section) => String(section.name ?? "").trim().toLowerCase() === normalizedName,
  );
  if (duplicate) {
    throw ApiError.badRequest("Section already exists in this class");
  }

  const classCapacity = Number(schoolClass.capacity ?? 0);
  if (classCapacity > 0) {
    const sectionRows = await Section.findAll({
      where: {
        classId,
        branchId,
        ...(existing?.id ? { id: { [Op.ne]: existing.id } } : {}),
      },
      attributes: ["capacity"],
    });
    const usedCapacity = sectionRows.reduce((sum, row) => sum + Number(row.capacity ?? 0), 0);
    if (usedCapacity + capacity > classCapacity) {
      throw ApiError.badRequest("Total section capacity cannot exceed class capacity");
    }
  }

  body.classId = classId;
  body.name = name;
  body.capacity = capacity;
  body.branchId = branchId;
  return body;
};

const validateAcademicYear = async (body: any, req: Request) => {
  const existing = await getExisting(AcademicYear, req);
  const branchId = req.user?.branchId;
  const name = String(body.name ?? existing?.name ?? "").trim();
  const start = body.startDate !== undefined ? new Date(body.startDate) : (existing?.startDate ? new Date(existing.startDate) : null);
  const end = body.endDate !== undefined ? new Date(body.endDate) : (existing?.endDate ? new Date(existing.endDate) : null);
  const isCurrent = body.isCurrent !== undefined ? Boolean(body.isCurrent) : Boolean(existing?.isCurrent);
  const isClosed = body.isClosed !== undefined ? Boolean(body.isClosed) : Boolean(existing?.isClosed);
  if (!name) throw ApiError.badRequest("Academic year name is required");
  if (!start || !end || !Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start >= end) {
    throw ApiError.badRequest("Academic year startDate must be before endDate");
  }
  if (isClosed && isCurrent) throw ApiError.badRequest("A closed academic year cannot be current");
  if (isCurrent) {
    const current = await AcademicYear.findOne({
      where: { isCurrent: true, ...(branchId != null ? { branchId } : {}), ...(existing?.id ? { id: { [Op.ne]: existing.id } } : {}) },
    });
    if (current) throw ApiError.badRequest("Another academic year is already marked as current");
  }
  body.name = name;
  body.startDate = start;
  body.endDate = end;
  body.isCurrent = isCurrent;
  body.isClosed = isClosed;
  body.branchId = branchId;
  return body;
};

const validateTerm = async (body: any, req: Request) => {
  const existing = await getExisting(Term, req);
  const branchId = Number(req.user?.branchId);
  const academicYearId = Number(body.academicYearId ?? existing?.academicYearId);

  if (!Number.isInteger(branchId) || branchId <= 0) throw ApiError.badRequest("User is not assigned to a branch");
  if (!Number.isInteger(academicYearId) || academicYearId <= 0) throw ApiError.badRequest("academicYearId is required");

  const year = await AcademicYear.findOne({ where: { id: academicYearId, branchId } });
  if (!year) throw ApiError.badRequest("Academic year not found or outside your branch");

  const name = String(body.name ?? existing?.name ?? "").trim();
  if (!name) throw ApiError.badRequest("Term name is required");
  if (name.length > 50) throw ApiError.badRequest("Term name must be 50 characters or fewer");

  const start = body.startDate !== undefined ? new Date(body.startDate) : (existing?.startDate ? new Date(existing.startDate) : null);
  const end = body.endDate !== undefined ? new Date(body.endDate) : (existing?.endDate ? new Date(existing.endDate) : null);
  const yearStart = new Date(year.startDate);
  const yearEnd = new Date(year.endDate);

  if (start && !Number.isFinite(start.getTime())) throw ApiError.badRequest("Invalid term startDate");
  if (end && !Number.isFinite(end.getTime())) throw ApiError.badRequest("Invalid term endDate");
  if (start && end && start >= end) throw ApiError.badRequest("Term startDate must be before endDate");
  if (start && (start < yearStart || start > yearEnd)) throw ApiError.badRequest("Term startDate must be within the academic year");
  if (end && (end < yearStart || end > yearEnd)) throw ApiError.badRequest("Term endDate must be within the academic year");

  const duplicate = await Term.findOne({
    where: {
      academicYearId,
      branchId,
      ...(existing?.id ? { id: { [Op.ne]: existing.id } } : {}),
    },
  });
  if (duplicate && String(duplicate.name).trim().toLowerCase() === name.toLowerCase()) {
    throw ApiError.badRequest("Term already exists in this academic year");
  }

  body.academicYearId = academicYearId;
  body.name = name;
  body.startDate = start;
  body.endDate = end;
  body.branchId = branchId;
  return body;
};

const validateEnrolment = async (body: any, req: Request) => {
  const existing = await getExisting(Enrolment, req);
  const branchId = Number(req.user?.branchId);
  const classId = Number(body.classId ?? existing?.classId);
  const sectionId = body.sectionId !== undefined ? (body.sectionId ? Number(body.sectionId) : null) : (existing?.sectionId ?? null);
  const studentId = Number(body.studentId ?? existing?.studentId);
  const academicYearId = Number(body.academicYearId ?? existing?.academicYearId);
  const status = String(body.status ?? existing?.status ?? "active");

  if (!Number.isInteger(branchId) || branchId <= 0) throw ApiError.badRequest("User is not assigned to a branch");
  if (![studentId, classId, academicYearId].every((v) => Number.isInteger(v) && v > 0)) {
    throw ApiError.badRequest("studentId, academicYearId and classId are required");
  }
  if (existing && (Number(existing.studentId) !== studentId || Number(existing.academicYearId) !== academicYearId)) {
    throw ApiError.badRequest("Student and academic year cannot be changed on an existing enrolment");
  }
  if (!["active", "promoted", "graduated", "transferred", "withdrawn", "expelled"].includes(status)) {
    throw ApiError.badRequest("Invalid enrolment status");
  }

  const student = await Student.findOne({ where: { id: studentId, branchId } });
  if (!student) throw ApiError.badRequest("Student not found or outside your branch");
  const schoolClass = await SchoolClass.findOne({ where: { id: classId, branchId } });
  if (!schoolClass || !schoolClass.isActive) throw ApiError.badRequest("Class not found, inactive, or outside your branch");

  if (sectionId) {
    const section = await Section.findOne({ where: { id: sectionId, branchId } });
    if (!section || !section.isActive || Number(section.classId) !== classId) {
      throw ApiError.badRequest("Section not found, inactive, or not assigned to the selected class");
    }
  }

  const year = await AcademicYear.findOne({ where: { id: academicYearId, branchId } });
  if (!year) throw ApiError.badRequest("Academic year not found or outside your branch");
  if (year.isClosed && status === "active") throw ApiError.badRequest("A closed academic year cannot have an active enrolment");

  const duplicate = await Enrolment.findOne({
    where: { studentId, academicYearId, branchId, status: "active", ...(existing?.id ? { id: { [Op.ne]: existing.id } } : {}) },
  });
  if (duplicate) throw ApiError.badRequest("Student already has an active enrolment for this academic year");

  body.studentId = studentId; body.academicYearId = academicYearId; body.classId = classId;
  body.sectionId = sectionId; body.status = status; body.branchId = branchId;
  return body;
};

const validateClassSubject = async (body: any, req: Request) => {
  const existing = await getExisting(ClassSubject, req);
  const classId = Number(body.classId ?? existing?.classId);
  const subjectId = Number(body.subjectId ?? existing?.subjectId);
  const branchId = Number(req.user?.branchId);

  if (!Number.isInteger(branchId) || branchId <= 0) throw ApiError.badRequest("User is not assigned to a branch");
  if (!Number.isInteger(classId) || classId <= 0 || !Number.isInteger(subjectId) || subjectId <= 0) {
    throw ApiError.badRequest("classId and subjectId are required");
  }

  const schoolClass = await SchoolClass.findOne({ where: { id: classId, branchId } });
  if (!schoolClass || !schoolClass.isActive) throw ApiError.badRequest("Class not found, inactive, or outside your branch");

  const subject = await Subject.findOne({ where: { id: subjectId, branchId } });
  if (!subject || !subject.isActive) throw ApiError.badRequest("Subject not found, inactive, or outside your branch");

  const duplicate = await ClassSubject.findOne({
    where: {
      classId,
      subjectId,
      branchId,
      ...(existing?.id ? { id: { [Op.ne]: existing.id } } : {}),
    },
  });
  if (duplicate) throw ApiError.badRequest("Subject is already assigned to this class");

  body.classId = classId;
  body.subjectId = subjectId;
  body.branchId = branchId;
  return body;
};

const validateRole = async (body: any, req: Request) => {
  const existing = await getExisting(Role, req);
  const name = String(body.name ?? existing?.name ?? "").trim().toLowerCase();
  const label = String(body.label ?? existing?.label ?? name).trim();
  if (!name) throw ApiError.badRequest("Role name is required");
  if (!/^[a-z][a-z0-9_-]{1,49}$/.test(name)) throw ApiError.badRequest("Invalid role name");
  const duplicate = await Role.findOne({ where: { name, ...(existing?.id ? { id: { [Op.ne]: existing.id } } : {}) } });
  if (duplicate) throw ApiError.badRequest("Role name already exists");
  if (existing?.isSystem) {
    if (body.name !== undefined && name !== existing.name) throw ApiError.badRequest("System role name cannot be changed");
    body.name = existing.name;
    body.isSystem = true;
  } else {
    body.name = name;
    body.isSystem = Boolean(body.isSystem ?? existing?.isSystem ?? false);
  }
  body.label = label || name;
  return body;
};

const validateBranch = async (body: any, req: Request) => {
  const existing = await getExisting(Branch, req);
  const name = String(body.name ?? existing?.name ?? "").trim();
  const code = String(body.code ?? existing?.code ?? "").trim();
  const email = String(body.email ?? existing?.email ?? "").trim();
  const phone = String(body.phone ?? existing?.phone ?? "").trim();
  const isActive = body.isActive !== undefined ? Boolean(body.isActive) : Boolean(existing?.isActive ?? true);
  if (!name) throw ApiError.badRequest("Branch name is required");
  if (code && !/^[A-Za-z0-9_-]{1,50}$/.test(code)) throw ApiError.badRequest("Invalid branch code");
  if (email && !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) throw ApiError.badRequest("Invalid branch email");
  const duplicate = await Branch.findOne({
    where: { name, ...(existing?.id ? { id: { [Op.ne]: existing.id } } : {}) },
  });
  if (duplicate) throw ApiError.badRequest("Branch name already exists");
  if (code) {
    const codeDuplicate = await Branch.findOne({ where: { code, ...(existing?.id ? { id: { [Op.ne]: existing.id } } : {}) } });
    if (codeDuplicate) throw ApiError.badRequest("Branch code already exists");
  }
  body.name = name;
  body.code = code || null;
  body.email = email || null;
  body.phone = phone || null;
  body.isActive = isActive;
  return body;
};

export const ACADEMICS_RESOURCES: ResourceDefinition[] = [
  { path: "roles", model: Role, searchable: ["name", "label", "description"], permission: "roles", beforeCreate: validateRole, beforeUpdate: validateRole },
  { path: "permissions", model: Permission, searchable: ["key", "label", "category"], permission: "permissions", readonly: true },
  { path: "branches", model: Branch, searchable: ["name", "code", "city", "email"], permission: "branches", beforeCreate: validateBranch, beforeUpdate: validateBranch },
  {
    path: "academic-years", model: AcademicYear, searchable: ["name"], permission: "academic",
    beforeCreate: validateAcademicYear,
    beforeUpdate: validateAcademicYear,
  },
  {
    path: "terms", model: Term, searchable: ["name"], permission: "academic",
    beforeCreate: validateTerm,
    beforeUpdate: validateTerm,
  },
  { path: "classes", model: SchoolClass, searchable: ["name", "level"], permission: "classes", beforeCreate: validateSchoolClass, beforeUpdate: validateSchoolClass },
  { path: "sections", model: Section, searchable: ["name"], permission: "sections", beforeCreate: validateSection, beforeUpdate: validateSection },
  { path: "subjects", model: Subject, searchable: ["name", "code"], permission: "subjects", beforeCreate: validateSubject, beforeUpdate: validateSubject },
  { path: "class-subjects", model: ClassSubject, searchable: [], permission: "subjects", beforeCreate: validateClassSubject, beforeUpdate: validateClassSubject },
  {
    path: "enrolments", model: Enrolment, searchable: ["rollNo", "status"], permission: "students",
    beforeCreate: validateEnrolment,
    beforeUpdate: validateEnrolment,
  },
];
