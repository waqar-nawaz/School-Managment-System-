import { Request } from "express";
import { ApiError } from "../../utils/ApiError";
import { Op } from "sequelize";
import {
  Role, Permission, Branch, AcademicYear, Term, SchoolClass, Section, Subject, Student, Certificate,
  ClassSubject, Enrolment, Parent, Teacher, Staff, Exam, ExamSchedule, ExamResult,
  ReportCard, Assignment, Submission, GradebookEntry, GradeScale, Timetable, Period,
  FeeType, Expense, PayrollItem, Payslip, LeaveRequest, Book, BookCopy, BookFine,
  Route, RouteStop, Vehicle, DriverAssignment, StudentTransport, Hostel, Room, Bed,
  HostelAllocation, Event, Notice, Announcement, Message, Notification, Syllabus,
  LessonPlan, HealthRecord, DisciplineRecord, Complaint, InventoryItem, Asset,
  AuditLog, VisitorLog, User, BookIssue,
} from "../../models";

export interface ResourceDefinition {
  path: string;
  model: any;
  searchable: string[];
  permission: string; // module name used for :read/:create/:update/:delete
  defaultSort?: [string, "ASC" | "DESC"];
  readonly?: boolean; // no write operations exposed
  beforeCreate?: (body: any, req: Request) => Record<string, unknown> | Promise<Record<string, unknown>>;
  beforeUpdate?: (body: any, req: Request) => Record<string, unknown> | Promise<Record<string, unknown>>;
  includes?: any[];
  decorate?: (row: any) => Record<string, unknown>;
}

/** Row → plain object (works for Sequelize instances and plain rows). */
const plain = (row: any): Record<string, any> =>
  row && typeof row.get === "function" ? row.get({ plain: true }) : { ...row };

const getExisting = async (model: any, req: Request) => {
  const id = req.params?.id;
  return id ? model.findByPk(id) : null;
};

const validateStaffProfile = async (body: any, req: Request, model: any, label: string) => {
  const existing = await getExisting(model, req);
  const branchId = req.user?.branchId;
  const userId = Number(body.userId ?? existing?.userId);
  if (!Number.isInteger(userId) || userId <= 0) throw new Error("userId is required");
  const user = await User.findByPk(userId);
  if (!user || !user.isActive) throw new Error(`Selected ${label} user is not active`);
  if (branchId != null && Number(user.branchId) !== Number(branchId)) throw new Error(`Selected ${label} user does not belong to your branch`);
  const staffNo = String(body.staffNo ?? existing?.staffNo ?? "").trim();
  if (!staffNo) throw new Error("staffNo is required");
  const duplicate = await model.findOne({ where: { staffNo, ...(branchId != null ? { branchId } : {}), ...(existing?.id ? { id: { [Op.ne]: existing.id } } : {}) } });
  if (duplicate) throw new Error(`${label} staffNo already exists in this branch`);
  body.userId = userId;
  body.staffNo = staffNo;
  body.branchId = branchId;
  if (body.isActive === undefined) body.isActive = existing?.isActive ?? true;
  return body;
};

const validateParentProfile = async (body: any, req: Request) => {
  const existing = await getExisting(Parent, req);
  const branchId = req.user?.branchId;
  const userId = Number(body.userId ?? existing?.userId);
  if (!Number.isInteger(userId) || userId <= 0) throw new Error("userId is required");
  const user = await User.findByPk(userId);
  if (!user || !user.isActive) throw new Error("Selected parent user is not active");
  if (branchId != null && Number(user.branchId) !== Number(branchId)) throw new Error("Selected parent user does not belong to your branch");
  const fullName = String(body.fullName ?? existing?.fullName ?? "").trim();
  if (!fullName) throw new Error("Parent fullName is required");
  body.userId = userId;
  body.fullName = fullName;
  body.branchId = branchId;
  return body;
};

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
  if (!name) throw new Error("Class name is required");
  if (!Number.isInteger(capacity) || capacity < 0) throw new Error("Class capacity must be a non-negative integer");
  const duplicate = await SchoolClass.findOne({
    where: {
      name,
      ...(branchId != null ? { branchId } : {}),
      ...(existing?.id ? { id: { [Op.ne]: existing.id } } : {}),
    },
  });
  if (duplicate) throw new Error("Class already exists in this branch");
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
  if (!name) throw new Error("Academic year name is required");
  if (!start || !end || !Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start >= end) {
    throw new Error("Academic year startDate must be before endDate");
  }
  if (isClosed && isCurrent) throw new Error("A closed academic year cannot be current");
  if (isCurrent) {
    const current = await AcademicYear.findOne({
      where: { isCurrent: true, ...(branchId != null ? { branchId } : {}), ...(existing?.id ? { id: { [Op.ne]: existing.id } } : {}) },
    });
    if (current) throw new Error("Another academic year is already marked as current");
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

const validateExamResult = async (body: any, req: Request) => {
  const existing = await getExisting(ExamResult, req);
  const branchId = Number(req.user?.branchId);
  const examId = Number(body.examId ?? existing?.examId);
  const studentId = Number(body.studentId ?? existing?.studentId);
  const subjectId = Number(body.subjectId ?? existing?.subjectId);
  const obtained = Number(body.marksObtained ?? existing?.marksObtained);
  const max = Number(body.maxMarks ?? existing?.maxMarks);

  if (!Number.isInteger(branchId) || branchId <= 0) throw ApiError.badRequest("User is not assigned to a branch");
  if (![examId, studentId, subjectId].every((v) => Number.isInteger(v) && v > 0)) {
    throw ApiError.badRequest("examId, studentId and subjectId are required");
  }
  if (!Number.isFinite(max) || max <= 0) throw ApiError.badRequest("maxMarks must be greater than 0");
  if (!Number.isFinite(obtained) || obtained < 0 || obtained > max) throw ApiError.badRequest("marksObtained must be between 0 and maxMarks");

  const exam = await Exam.findOne({ where: { id: examId, branchId } });
  if (!exam) throw ApiError.badRequest("Exam not found or outside your branch");
  const student = await Student.findOne({ where: { id: studentId, branchId } });
  if (!student) throw ApiError.badRequest("Student not found or outside your branch");

  const enrolment = await Enrolment.findOne({
    where: { studentId, academicYearId: exam.academicYearId, branchId, status: { [Op.notIn]: ["withdrawn", "expelled"] } },
  });
  if (!enrolment) throw ApiError.badRequest("Student is not enrolled in the exam academic year");

  const subject = await Subject.findOne({ where: { id: subjectId, branchId } });
  if (!subject || !subject.isActive) throw ApiError.badRequest("Subject not found, inactive, or outside your branch");
  const classSubject = await ClassSubject.findOne({ where: { classId: enrolment.classId, subjectId, branchId } });
  if (!classSubject) throw ApiError.badRequest("Subject is not assigned to the student's class");

  const duplicate = await ExamResult.findOne({
    where: { examId, studentId, subjectId, branchId, ...(existing?.id ? { id: { [Op.ne]: existing.id } } : {}) },
  });
  if (duplicate) throw ApiError.badRequest("Exam result already exists for this student and subject");

  body.examId = examId; body.studentId = studentId; body.subjectId = subjectId;
  body.maxMarks = max; body.marksObtained = obtained; body.branchId = branchId;
  return body;
};

const parseTimeMinutes = (value: unknown): number | null => {
  const s = String(value ?? "").trim();
  const m = /^(\\d{1,2}):(\\d{2})$/.exec(s);
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2]);
  return h >= 0 && h <= 23 && min >= 0 && min <= 59 ? h * 60 + min : null;
};

const validateExamSchedule = async (body: any, req: Request) => {
  const existing = await getExisting(ExamSchedule, req);
  const branchId = Number(req.user?.branchId);
  const examId = Number(body.examId ?? existing?.examId);
  const classId = Number(body.classId ?? existing?.classId);
  const sectionId = body.sectionId !== undefined ? (body.sectionId ? Number(body.sectionId) : null) : (existing?.sectionId ?? null);
  const subjectId = Number(body.subjectId ?? existing?.subjectId);
  const date = body.date !== undefined ? new Date(body.date) : (existing?.date ? new Date(existing.date) : null);
  const start = parseTimeMinutes(body.startTime ?? existing?.startTime);
  const end = parseTimeMinutes(body.endTime ?? existing?.endTime);

  if (!Number.isInteger(branchId) || branchId <= 0) throw ApiError.badRequest("User is not assigned to a branch");
  if (![examId, classId, subjectId].every((v) => Number.isInteger(v) && v > 0)) {
    throw ApiError.badRequest("examId, classId and subjectId are required");
  }
  if (start === null || end === null || start >= end) throw ApiError.badRequest("Invalid exam schedule time range");
  if (!date || !Number.isFinite(date.getTime())) throw ApiError.badRequest("Valid exam date is required");

  const exam = await Exam.findOne({ where: { id: examId, branchId } });
  if (!exam) throw ApiError.badRequest("Exam not found or outside your branch");
  if (exam.startDate && date < new Date(exam.startDate)) throw ApiError.badRequest("Exam schedule date is before the exam start date");
  if (exam.endDate && date > new Date(exam.endDate)) throw ApiError.badRequest("Exam schedule date is after the exam end date");

  const schoolClass = await SchoolClass.findOne({ where: { id: classId, branchId } });
  if (!schoolClass || !schoolClass.isActive) throw ApiError.badRequest("Selected class is not active or outside your branch");
  const subject = await Subject.findOne({ where: { id: subjectId, branchId } });
  if (!subject || !subject.isActive) throw ApiError.badRequest("Selected subject is not active or outside your branch");

  if (sectionId) {
    const section = await Section.findOne({ where: { id: sectionId, branchId } });
    if (!section || !section.isActive || Number(section.classId) !== classId) {
      throw ApiError.badRequest("Selected section is invalid for the selected class");
    }
  }

  const classSubject = await ClassSubject.findOne({ where: { classId, subjectId, branchId } });
  if (!classSubject) throw ApiError.badRequest("Subject is not assigned to the selected class");

  const duplicate = await ExamSchedule.findOne({
    where: { examId, classId, sectionId: sectionId ?? null, subjectId, branchId, date, ...(existing?.id ? { id: { [Op.ne]: existing.id } } : {}) },
  });
  if (duplicate) throw ApiError.badRequest("This subject is already scheduled for the selected class on this date");

  body.examId = examId; body.classId = classId; body.sectionId = sectionId;
  body.subjectId = subjectId; body.date = date; body.branchId = branchId;
  body.startTime = String(body.startTime ?? existing?.startTime ?? "").trim();
  body.endTime = String(body.endTime ?? existing?.endTime ?? "").trim();
  return body;
};

const validateExam = async (body: any, req: Request) => {
  const existing = await getExisting(Exam, req);
  const name = String(body.name ?? existing?.name ?? '').trim();
  const academicYearId = Number(body.academicYearId ?? existing?.academicYearId);
  const termId = body.termId !== undefined ? (body.termId ? Number(body.termId) : null) : (existing?.termId ?? null);
  const start = body.startDate !== undefined ? new Date(body.startDate) : (existing?.startDate ? new Date(existing.startDate) : null);
  const end = body.endDate !== undefined ? new Date(body.endDate) : (existing?.endDate ? new Date(existing.endDate) : null);
  const maxMarks = Number(body.maxMarks ?? existing?.maxMarks ?? 100);
  const type = String(body.examType ?? existing?.examType ?? 'midterm');
  const status = String(body.status ?? existing?.status ?? 'draft');
  if (!name || !Number.isInteger(academicYearId) || academicYearId <= 0) throw new Error('name and academicYearId are required');
  if (!['weekly','monthly','midterm','final','quiz'].includes(type)) throw new Error('Invalid exam type');
  if (!['draft','published','completed','cancelled'].includes(status)) throw new Error('Invalid exam status');
  if (!start || !end || !Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start > end) throw new Error('Invalid exam date range');
  if (!Number.isInteger(maxMarks) || maxMarks <= 0) throw new Error('maxMarks must be a positive integer');
  const year = await AcademicYear.findByPk(academicYearId);
  if (!year) throw new Error('Academic year not found');
  if (start < new Date(year.startDate) || end > new Date(year.endDate)) throw new Error('Exam dates must be within the academic year');
  if (termId) { const term = await Term.findByPk(termId); if (!term || Number(term.academicYearId) !== academicYearId) throw new Error('Selected term does not belong to the academic year'); }
  body.name=name; body.academicYearId=academicYearId; body.termId=termId; body.startDate=start; body.endDate=end; body.maxMarks=maxMarks; body.examType=type; body.status=status; body.branchId=req.user?.branchId;
  return body;
};

const validateGradeScale = async (body: any, req: Request) => {
  const existing=await getExisting(GradeScale,req); const name=String(body.name??existing?.name??"").trim(); const grade=String(body.grade??existing?.grade??"").trim().toUpperCase();
  const min=Number(body.minPercentage??existing?.minPercentage); const max=Number(body.maxPercentage??existing?.maxPercentage); const branchId=Number(req.user?.branchId);
  if(!Number.isInteger(branchId)||branchId<=0) throw ApiError.badRequest("User is not assigned to a branch");
  if(!name||!grade) throw ApiError.badRequest("Grade scale name and grade are required");
  if(name.length>100||grade.length>20) throw ApiError.badRequest("Grade scale name or grade is too long");
  if(!Number.isFinite(min)||!Number.isFinite(max)||min<0||max>100||min>=max) throw ApiError.badRequest("Grade percentages must be 0-100 and minPercentage must be below maxPercentage");
  const duplicate=await GradeScale.findOne({where:{grade,branchId,...(existing?.id?{id:{[Op.ne]:existing.id}}:{})}}); if(duplicate) throw ApiError.badRequest("Grade already exists in this branch");
  const overlap=await GradeScale.findOne({where:{branchId,minPercentage:{[Op.lt]:max},maxPercentage:{[Op.gt]:min},...(existing?.id?{id:{[Op.ne]:existing.id}}:{})}}); if(overlap) throw ApiError.badRequest("Grade percentage range overlaps another grade");
  body.name=name; body.grade=grade; body.minPercentage=min; body.maxPercentage=max; body.branchId=branchId; return body;
};
const validateFeeType = async (body: any, req: Request) => {
  const existing=await getExisting(FeeType,req); const name=String(body.name??existing?.name??"").trim(); const category=String(body.category??existing?.category??"").trim().toLowerCase();
  const amount=Number(body.amount??existing?.amount??0); const installments=Number(body.installments??existing?.installments??1); const billingCycle=String(body.billingCycle??existing?.billingCycle??"term");
  const branchId=Number(req.user?.branchId);
  if(!Number.isInteger(branchId)||branchId<=0) throw ApiError.badRequest("User is not assigned to a branch");
  if(!name) throw ApiError.badRequest("Fee type name is required"); if(name.length>120) throw ApiError.badRequest("Fee type name is too long");
  if(category&&!["tuition","transport","hostel","misc"].includes(category)) throw ApiError.badRequest("Invalid fee category");
  if(!Number.isFinite(amount)||amount<0) throw ApiError.badRequest("Fee amount must be non-negative");
  if(!Number.isInteger(installments)||installments<1) throw ApiError.badRequest("installments must be a positive integer");
  if(!["term","monthly","yearly","one-time"].includes(billingCycle)) throw ApiError.badRequest("Invalid billingCycle");
  const duplicate=await FeeType.findOne({where:{name,branchId,...(existing?.id?{id:{[Op.ne]:existing.id}}:{})}}); if(duplicate) throw ApiError.badRequest("Fee type already exists in this branch");
  body.name=name; body.category=category; body.amount=amount; body.installments=installments; body.billingCycle=billingCycle; body.branchId=branchId; return body;
};
const validateExpense = async (body: any, req: Request) => {
  const existing=await getExisting(Expense,req); const title=String(body.title??existing?.title??"").trim(); const amount=Number(body.amount??existing?.amount);
  const expensedOn=body.expensedOn!==undefined?(body.expensedOn?new Date(body.expensedOn):null):(existing?.expensedOn?new Date(existing.expensedOn):null);
  const status=String(body.status??existing?.status??"approved").toLowerCase(); const branchId=Number(req.user?.branchId);
  if(!Number.isInteger(branchId)||branchId<=0) throw ApiError.badRequest("User is not assigned to a branch");
  if(!title) throw ApiError.badRequest("Expense title is required"); if(title.length>200) throw ApiError.badRequest("Expense title is too long");
  if(!Number.isFinite(amount)||amount<0) throw ApiError.badRequest("Expense amount must be non-negative");
  if(expensedOn&&!Number.isFinite(expensedOn.getTime())) throw ApiError.badRequest("Invalid expensedOn");
  if(!["draft","approved","rejected","paid","cancelled"].includes(status)) throw ApiError.badRequest("Invalid expense status");
  const createdBy=body.createdBy??existing?.createdBy, approvedBy=body.approvedBy??existing?.approvedBy;
  if(createdBy){const u=await User.findOne({where:{id:Number(createdBy),branchId}}); if(!u) throw ApiError.badRequest("createdBy user does not belong to your branch");}
  if(approvedBy){const u=await User.findOne({where:{id:Number(approvedBy),branchId}}); if(!u) throw ApiError.badRequest("approvedBy user does not belong to your branch");}
  body.title=title; body.amount=amount; body.expensedOn=expensedOn; body.status=status; body.branchId=branchId; return body;
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

const validateAssignment = async (body: any, req: Request) => {
  const existing = await getExisting(Assignment, req);
  const title = String(body.title ?? existing?.title ?? "").trim();
  const classId = Number(body.classId ?? existing?.classId);
  const subjectId = Number(body.subjectId ?? existing?.subjectId);
  const maxMarks = Number(body.maxMarks ?? existing?.maxMarks);
  const dueDate = body.dueDate !== undefined ? new Date(body.dueDate) : (existing?.dueDate ? new Date(existing.dueDate) : null);
  const branchId = Number(req.user?.branchId);
  if (!Number.isInteger(branchId) || branchId <= 0) throw ApiError.badRequest("User is not assigned to a branch");
  if (!title || !Number.isInteger(classId) || classId <= 0 || !Number.isInteger(subjectId) || subjectId <= 0) throw ApiError.badRequest("title, classId and subjectId are required");
  if (title.length > 200) throw ApiError.badRequest("Assignment title must be 200 characters or fewer");
  if (!Number.isInteger(maxMarks) || maxMarks <= 0) throw ApiError.badRequest("maxMarks must be a positive integer");
  if (dueDate && !Number.isFinite(dueDate.getTime())) throw ApiError.badRequest("Invalid dueDate");
  const schoolClass = await SchoolClass.findOne({ where: { id: classId, branchId } });
  if (!schoolClass || !schoolClass.isActive) throw ApiError.badRequest("Class not found, inactive, or outside your branch");
  const subject = await Subject.findOne({ where: { id: subjectId, branchId } });
  if (!subject || !subject.isActive) throw ApiError.badRequest("Subject not found, inactive, or outside your branch");
  if (!(await ClassSubject.findOne({ where: { classId, subjectId, branchId } }))) throw ApiError.badRequest("Subject is not assigned to the selected class");
  const teacherId = body.createdBy ?? existing?.createdBy;
  if (teacherId) {
    const teacher = await Teacher.findOne({ where: { id: Number(teacherId), branchId }, include: [{ model: User }] });
    if (!teacher || !teacher.isActive || Number(teacher.user?.branchId) !== branchId) throw ApiError.badRequest("Assignment teacher does not belong to your branch");
  }
  body.title = title; body.classId = classId; body.subjectId = subjectId; body.maxMarks = maxMarks; body.dueDate = dueDate; body.branchId = branchId;
  return body;
};

const validateSubmission = async (body: any, req: Request) => {
  const existing = await getExisting(Submission, req);
  const assignmentId = Number(body.assignmentId ?? existing?.assignmentId);
  const studentId = Number(body.studentId ?? existing?.studentId);
  const marks = body.marksAwarded !== undefined ? Number(body.marksAwarded) : (existing?.marksAwarded != null ? Number(existing.marksAwarded) : null);
  const submittedAt = body.submittedAt !== undefined ? (body.submittedAt ? new Date(body.submittedAt) : null) : (existing?.submittedAt ? new Date(existing.submittedAt) : null);
  const branchId = Number(req.user?.branchId);
  if (!Number.isInteger(branchId) || branchId <= 0) throw ApiError.badRequest("User is not assigned to a branch");
  if (!Number.isInteger(assignmentId) || assignmentId <= 0 || !Number.isInteger(studentId) || studentId <= 0) throw ApiError.badRequest("assignmentId and studentId are required");
  const assignment = await Assignment.findOne({ where: { id: assignmentId, branchId } });
  if (!assignment) throw ApiError.badRequest("Assignment not found or outside your branch");
  const student = await Student.findOne({ where: { id: studentId, branchId } });
  if (!student) throw ApiError.badRequest("Student not found or outside your branch");
  const enrolment = await Enrolment.findOne({ where: { studentId, classId: assignment.classId, branchId, status: { [Op.notIn]: ["withdrawn", "expelled"] } } });
  if (!enrolment) throw ApiError.badRequest("Student is not enrolled in the assignment class");
  if (marks != null && (!Number.isFinite(marks) || marks < 0 || marks > Number(assignment.maxMarks))) throw ApiError.badRequest("marksAwarded must be between 0 and assignment maxMarks");
  if (submittedAt && !Number.isFinite(submittedAt.getTime())) throw ApiError.badRequest("Invalid submittedAt");
  const status = String(body.status ?? existing?.status ?? "submitted");
  if (!["submitted","graded","returned","late"].includes(status)) throw ApiError.badRequest("Invalid submission status");
  const duplicate = await Submission.findOne({ where: { assignmentId, studentId, branchId, ...(existing?.id ? { id: { [Op.ne]: existing.id } } : {}) } });
  if (duplicate) throw ApiError.badRequest("Submission already exists for this assignment and student");
  body.assignmentId = assignmentId; body.studentId = studentId; body.marksAwarded = marks; body.submittedAt = submittedAt; body.status = status; body.branchId = branchId;
  return body;
};
const validateGradebook = async (body: any, req: Request) => {
  const existing = await getExisting(GradebookEntry, req);
  const studentId = Number(body.studentId ?? existing?.studentId);
  const termId = Number(body.termId ?? existing?.termId);
  const subjectId = Number(body.subjectId ?? existing?.subjectId);
  const branchId = Number(req.user?.branchId);
  if (!Number.isInteger(branchId) || branchId <= 0) throw ApiError.badRequest("User is not assigned to a branch");
  if (!Number.isInteger(studentId) || studentId <= 0 || !Number.isInteger(termId) || termId <= 0 || !Number.isInteger(subjectId) || subjectId <= 0) throw ApiError.badRequest("studentId, termId and subjectId are required");
  const student = await Student.findOne({ where: { id: studentId, branchId } });
  if (!student) throw ApiError.badRequest("Student not found or outside your branch");
  const term = await Term.findOne({ where: { id: termId, branchId } });
  if (!term) throw ApiError.badRequest("Term not found or outside your branch");
  const enrolment = await Enrolment.findOne({ where: { studentId, academicYearId: term.academicYearId, branchId, status: { [Op.notIn]: ["withdrawn","expelled"] } } });
  if (!enrolment) throw ApiError.badRequest("Student is not enrolled in the term academic year");
  const subject = await Subject.findOne({ where: { id: subjectId, branchId } });
  if (!subject || !subject.isActive) throw ApiError.badRequest("Subject not found, inactive, or outside your branch");
  if (!(await ClassSubject.findOne({ where: { classId: enrolment.classId, subjectId, branchId } }))) throw ApiError.badRequest("Subject is not assigned to the student's class");
  for (const key of ["continuousAvg","examScore","total"]) {
    if (body[key] !== undefined && body[key] !== null && (!Number.isFinite(Number(body[key])) || Number(body[key]) < 0 || Number(body[key]) > 100)) throw ApiError.badRequest(key + " must be between 0 and 100");
  }
  const duplicate = await GradebookEntry.findOne({ where: { studentId, termId, subjectId, branchId, ...(existing?.id ? { id: { [Op.ne]: existing.id } } : {}) } });
  if (duplicate) throw ApiError.badRequest("Gradebook entry already exists for this student, term and subject");
  body.studentId=studentId; body.termId=termId; body.subjectId=subjectId; body.branchId=branchId;
  return body;
};
const validateTimetable = async (body: any, req: Request) => {
  const existing = await getExisting(Timetable, req);
  const name = String(body.name ?? existing?.name ?? "").trim();
  const classId = Number(body.classId ?? existing?.classId);
  const sectionId = body.sectionId !== undefined ? (body.sectionId ? Number(body.sectionId) : null) : (existing?.sectionId ?? null);
  const validFrom = body.validFrom !== undefined ? (body.validFrom ? new Date(body.validFrom) : null) : (existing?.validFrom ? new Date(existing.validFrom) : null);
  const validTo = body.validTo !== undefined ? (body.validTo ? new Date(body.validTo) : null) : (existing?.validTo ? new Date(existing.validTo) : null);
  const branchId=Number(req.user?.branchId);
  if(!Number.isInteger(branchId)||branchId<=0) throw ApiError.badRequest("User is not assigned to a branch");
  if(!name || !Number.isInteger(classId) || classId<=0) throw ApiError.badRequest("name and classId are required");
  if(name.length>100) throw ApiError.badRequest("Timetable name must be 100 characters or fewer");
  if((validFrom && !Number.isFinite(validFrom.getTime())) || (validTo && !Number.isFinite(validTo.getTime()))) throw ApiError.badRequest("Invalid timetable dates");
  if(validFrom && validTo && validFrom>validTo) throw ApiError.badRequest("validFrom must be before validTo");
  const schoolClass=await SchoolClass.findOne({where:{id:classId,branchId}});
  if(!schoolClass||!schoolClass.isActive) throw ApiError.badRequest("Class not found, inactive, or outside your branch");
  if(sectionId){ const section=await Section.findOne({where:{id:sectionId,branchId}}); if(!section||!section.isActive||Number(section.classId)!==classId) throw ApiError.badRequest("Selected section does not belong to the selected class"); }
  body.name=name; body.classId=classId; body.sectionId=sectionId; body.validFrom=validFrom; body.validTo=validTo; body.branchId=branchId; return body;
};
const validatePeriod = async (body: any, req: Request) => {
  const existing = await getExisting(Period, req);
  const classId=Number(body.classId ?? existing?.classId);
  const sectionId=body.sectionId!==undefined ? (body.sectionId ? Number(body.sectionId):null):(existing?.sectionId??null);
  const subjectId=body.subjectId!==undefined ? (body.subjectId ? Number(body.subjectId):null):(existing?.subjectId??null);
  const teacherId=body.teacherId!==undefined ? (body.teacherId ? Number(body.teacherId):null):(existing?.teacherId??null);
  const day=String(body.dayOfWeek ?? existing?.dayOfWeek ?? "").toUpperCase();
  const start=body.startTime ?? existing?.startTime; const end=body.endTime ?? existing?.endTime;
  const parse=(v:any)=>{const m=/^(\d{1,2}):(\d{2})$/.exec(String(v??"").trim()); if(!m)return null; const h=Number(m[1]),mi=Number(m[2]); return h>=0&&h<=23&&mi>=0&&mi<=59?h*60+mi:null;};
  const branchId=Number(req.user?.branchId);
  if(!Number.isInteger(branchId)||branchId<=0) throw ApiError.badRequest("User is not assigned to a branch");
  if(!Number.isInteger(classId)||classId<=0) throw ApiError.badRequest("classId is required");
  if(!["MON","TUE","WED","THU","FRI","SAT","SUN"].includes(day)) throw ApiError.badRequest("Invalid dayOfWeek");
  const sm=parse(start), em=parse(end); if(sm===null||em===null||sm>=em) throw ApiError.badRequest("Invalid period time range");
  const schoolClass=await SchoolClass.findOne({where:{id:classId,branchId}}); if(!schoolClass||!schoolClass.isActive) throw ApiError.badRequest("Class not found, inactive, or outside your branch");
  if(sectionId){const section=await Section.findOne({where:{id:sectionId,branchId}}); if(!section||!section.isActive||Number(section.classId)!==classId) throw ApiError.badRequest("Selected section does not belong to the selected class");}
  if(subjectId){const subject=await Subject.findOne({where:{id:subjectId,branchId}}); if(!subject||!subject.isActive||!(await ClassSubject.findOne({where:{classId,subjectId,branchId}}))) throw ApiError.badRequest("Subject is not assigned to the selected class");}
  if(teacherId){const teacher=await Teacher.findOne({where:{id:teacherId,branchId},include:[{model:User}]}); if(!teacher||!teacher.isActive||Number(teacher.user?.branchId)!==branchId) throw ApiError.badRequest("Teacher does not belong to your branch");}
  body.classId=classId; body.sectionId=sectionId; body.subjectId=subjectId; body.teacherId=teacherId; body.dayOfWeek=day; body.startTime=String(start).trim(); body.endTime=String(end).trim(); body.branchId=branchId; return body;
};
const validateReportCard = async (body: any, req: Request) => {
  const existing = await getExisting(ReportCard, req);
  const enrolmentId = Number(body.enrolmentId ?? existing?.enrolmentId);
  const termId = body.termId !== undefined ? (body.termId ? Number(body.termId) : null) : (existing?.termId ?? null);
  if (!Number.isInteger(enrolmentId) || enrolmentId <= 0) throw new Error('enrolmentId is required');
  const enrolment = await Enrolment.findByPk(enrolmentId);
  if (!enrolment) throw new Error('Enrolment not found');
  if (req.user?.branchId != null && Number(enrolment.branchId) !== Number(req.user.branchId)) throw new Error('Enrolment does not belong to your branch');
  if (termId) { const term = await Term.findByPk(termId); if (!term || Number(term.academicYearId) !== Number(enrolment.academicYearId)) throw new Error('Term does not belong to the enrolment academic year'); }
  if (existing && Number(existing.enrolmentId) !== enrolmentId) throw new Error('Report card enrolment cannot be changed');
  const duplicate = await ReportCard.findOne({ where: { enrolmentId, termId, ...(existing?.id ? { id: { [Op.ne]: existing.id } } : {}) } });
  if (duplicate) throw new Error('Report card already exists for this enrolment and term');
  body.enrolmentId=enrolmentId; body.studentId=enrolment.studentId; body.termId=termId; body.branchId=req.user?.branchId;
  return body;
};

const validateRoute = async (body: any, req: Request) => {
  const existing = await getExisting(Route, req);
  const name = String(body.name ?? existing?.name ?? "").trim();
  if (!name) throw new Error("Route name is required");
  const monthlyFee = Number(body.monthlyFee ?? existing?.monthlyFee ?? 0);
  if (!Number.isFinite(monthlyFee) || monthlyFee < 0) throw new Error("monthlyFee must be a non-negative number");
  body.name = name; body.monthlyFee = monthlyFee; body.branchId = req.user?.branchId;
  return body;
};

const validateRouteStop = async (body: any, req: Request) => {
  const existing = await getExisting(RouteStop, req);
  const routeId = Number(body.routeId ?? existing?.routeId);
  const name = String(body.name ?? existing?.name ?? "").trim();
  const orderIndex = Number(body.orderIndex ?? existing?.orderIndex);
  if (!Number.isInteger(routeId) || routeId <= 0 || !name) throw new Error("routeId and name are required");
  if (!Number.isInteger(orderIndex) || orderIndex < 0) throw new Error("orderIndex must be a non-negative integer");
  const route = await Route.findByPk(routeId);
  if (!route || !route.isActive) throw new Error("Selected route is not active");
  if (req.user?.branchId != null && Number(route.branchId) !== Number(req.user.branchId)) throw new Error("Selected route does not belong to your branch");
  if (body.stopFee !== undefined || existing?.stopFee !== undefined) {
    const fee = Number(body.stopFee ?? existing?.stopFee ?? 0);
    if (!Number.isFinite(fee) || fee < 0) throw new Error("stopFee must be a non-negative number");
    body.stopFee = fee;
  }
  body.routeId = routeId; body.name = name; body.orderIndex = orderIndex; body.branchId = req.user?.branchId;
  return body;
};

const validateVehicle = async (body: any, req: Request) => {
  const existing = await getExisting(Vehicle, req);
  const registrationNo = String(body.registrationNo ?? existing?.registrationNo ?? "").trim();
  if (!registrationNo) throw new Error("registrationNo is required");
  const capacity = Number(body.capacity ?? existing?.capacity);
  if (!Number.isInteger(capacity) || capacity <= 0) throw new Error("capacity must be a positive integer");
  const status = String(body.status ?? existing?.status ?? "active");
  if (!["active","maintenance","inactive"].includes(status)) throw new Error("Invalid vehicle status");
  const branchId = req.user?.branchId;
  const duplicate = await Vehicle.findOne({ where: { registrationNo, ...(branchId != null ? { branchId } : {}), ...(existing?.id ? { id: { [Op.ne]: existing.id } } : {}) } });
  if (duplicate) throw new Error("Vehicle registration number already exists");
  for (const field of ["insuranceExpiry","fitnessExpiry"]) {
    if (body[field] !== undefined || existing?.[field]) {
      const date = body[field] !== undefined ? new Date(body[field]) : new Date(existing[field]);
      if (!Number.isFinite(date.getTime())) throw new Error("Invalid vehicle expiry date");
      body[field] = date;
    }
  }
  body.registrationNo = registrationNo; body.capacity = capacity; body.status = status; body.branchId = branchId;
  return body;
};

const validateInventory = async (body: any, req: Request) => {
  const existing = await getExisting(InventoryItem, req);
  const name = String(body.name ?? existing?.name ?? "").trim();
  if (!name) throw new Error("Inventory item name is required");

  const quantity = Number(body.quantity ?? existing?.quantity ?? 0);
  const minQuantity = Number(body.minQuantity ?? existing?.minQuantity ?? 0);
  const unitPrice = Number(body.unitPrice ?? existing?.unitPrice ?? 0);
  if (!Number.isInteger(quantity) || quantity < 0) throw new Error("quantity must be a non-negative integer");
  if (!Number.isInteger(minQuantity) || minQuantity < 0) throw new Error("minQuantity must be a non-negative integer");
  if (!Number.isFinite(unitPrice) || unitPrice < 0) throw new Error("unitPrice must be a non-negative number");

  const sku = String(body.sku ?? existing?.sku ?? "").trim();
  const branchId = req.user?.branchId;
  if (sku) {
    const duplicate = await InventoryItem.findOne({
      where: {
        sku,
        ...(branchId != null ? { branchId } : {}),
        ...(existing?.id ? { id: { [Op.ne]: existing.id } } : {}),
      },
    });
    if (duplicate) throw new Error("Inventory SKU already exists");
    body.sku = sku;
  }
  body.name = name;
  body.quantity = quantity;
  body.minQuantity = minQuantity;
  body.unitPrice = unitPrice;
  return body;
};

const validateAsset = async (body: any, req: Request) => {
  const existing = await getExisting(Asset, req);
  const assetCode = String(body.assetCode ?? existing?.assetCode ?? "").trim();
  const name = String(body.name ?? existing?.name ?? "").trim();
  if (!assetCode || !name) throw new Error("assetCode and name are required");

  const branchId = req.user?.branchId;
  const duplicate = await Asset.findOne({
    where: {
      assetCode,
      ...(branchId != null ? { branchId } : {}),
      ...(existing?.id ? { id: { [Op.ne]: existing.id } } : {}),
    },
  });
  if (duplicate) throw new Error("Asset code already exists");

  if (body.purchaseDate !== undefined || existing?.purchaseDate) {
    const date = body.purchaseDate !== undefined ? new Date(body.purchaseDate) : new Date(existing.purchaseDate);
    if (!Number.isFinite(date.getTime())) throw new Error("Invalid purchaseDate");
    body.purchaseDate = date;
  }
  if (body.purchasePrice !== undefined || existing?.purchasePrice !== undefined) {
    const price = Number(body.purchasePrice ?? existing?.purchasePrice ?? 0);
    if (!Number.isFinite(price) || price < 0) throw new Error("purchasePrice must be a non-negative number");
    body.purchasePrice = price;
  }
  const allowed = ["in_use", "stored", "maintenance", "scrapped"];
  const status = String(body.status ?? existing?.status ?? "in_use");
  if (!allowed.includes(status)) throw new Error("Invalid asset status");
  body.assetCode = assetCode;
  body.name = name;
  body.status = status;
  return body;
};

const validateDiscipline = async (body: any, req: Request) => {
  const existing = await getExisting(DisciplineRecord, req);
  const studentId = Number(body.studentId ?? existing?.studentId);
  const type = String(body.type ?? existing?.type ?? "").trim();
  const recordedOn = body.recordedOn !== undefined ? new Date(body.recordedOn) : new Date(existing?.recordedOn ?? Date.now());
  if (!Number.isInteger(studentId) || studentId <= 0) throw new Error("Valid studentId is required");
  if (!type) throw new Error("type is required");
  if (!["warning", "detention", "suspension", "praise"].includes(type)) {
    throw new Error("Invalid discipline record type");
  }
  if (!Number.isFinite(recordedOn.getTime())) throw new Error("Invalid recordedOn date");

  const student = await Student.findByPk(studentId);
  if (!student) throw new Error("Student not found");
  if (req.user?.branchId != null && Number(student.branchId) !== Number(req.user.branchId)) {
    throw new Error("Student does not belong to your branch");
  }

  body.studentId = studentId;
  body.type = type;
  body.recordedOn = recordedOn;
  if (req.user?.id != null) body.recordedBy = req.user.id;
  return body;
};

const validateHostel = async (body: any, req: Request) => {
  const existing = await getExisting(Hostel, req);
  const name = String(body.name ?? existing?.name ?? "").trim();
  const gender = String(body.gender ?? existing?.gender ?? "");
  const capacity = Number(body.capacity ?? existing?.capacity ?? 0);
  const branchId = req.user?.branchId;
  if (!name) throw new Error("Hostel name is required");
  if (!["boys", "girls", "coed"].includes(gender)) throw new Error("Invalid hostel gender");
  if (!Number.isInteger(capacity) || capacity < 1) throw new Error("Hostel capacity must be a positive integer");
  body.name = name; body.gender = gender; body.capacity = capacity; body.branchId = branchId;
  return body;
};

const validateRoom = async (body: any, req: Request) => {
  const existing = await getExisting(Room, req);
  const hostelId = Number(body.hostelId ?? existing?.hostelId);
  const roomNo = String(body.roomNo ?? existing?.roomNo ?? "").trim();
  const capacity = Number(body.capacity ?? existing?.capacity ?? 4);
  const branchId = req.user?.branchId;
  if (!Number.isInteger(hostelId) || hostelId <= 0 || !roomNo) throw new Error("hostelId and roomNo are required");
  if (!Number.isInteger(capacity) || capacity < 1) throw new Error("Room capacity must be positive");
  const hostel = await Hostel.findByPk(hostelId);
  if (!hostel || hostel.isActive === false || (branchId != null && Number(hostel.branchId) !== Number(branchId))) {
    throw new Error("Hostel does not belong to your branch or is inactive");
  }
  const duplicate = await Room.findOne({ where: { hostelId, roomNo, ...(existing?.id ? { id: { [Op.ne]: existing.id } } : {}) } });
  if (duplicate) throw new Error("Room number already exists in this hostel");
  body.hostelId = hostelId; body.roomNo = roomNo; body.capacity = capacity; body.branchId = branchId;
  return body;
};

const validateBed = async (body: any, req: Request) => {
  const existing = await getExisting(Bed, req);
  const roomId = Number(body.roomId ?? existing?.roomId);
  const bedNo = String(body.bedNo ?? existing?.bedNo ?? "").trim();
  const branchId = req.user?.branchId;
  if (!Number.isInteger(roomId) || roomId <= 0 || !bedNo) throw new Error("roomId and bedNo are required");
  const room = await Room.findByPk(roomId);
  if (!room || (branchId != null && Number(room.branchId) !== Number(branchId))) throw new Error("Room does not belong to your branch");
  const duplicate = await Bed.findOne({ where: { roomId, bedNo, ...(existing?.id ? { id: { [Op.ne]: existing.id } } : {}) } });
  if (duplicate) throw new Error("Bed number already exists in this room");
  body.roomId = roomId; body.bedNo = bedNo; body.branchId = branchId;
  return body;
};

const validateHostelAllocation = async (body: any, req: Request) => {
  const existing = await getExisting(HostelAllocation, req);
  const studentId = Number(body.studentId ?? existing?.studentId);
  const bedId = Number(body.bedId ?? existing?.bedId);
  const branchId = req.user?.branchId;
  const status = String(body.status ?? existing?.status ?? "active");
  const monthlyFee = Number(body.monthlyFee ?? existing?.monthlyFee ?? 0);
  const checkIn = body.checkIn !== undefined ? new Date(body.checkIn) : (existing?.checkIn ? new Date(existing.checkIn) : new Date());
  const checkOut = body.checkOut !== undefined ? (body.checkOut ? new Date(body.checkOut) : null) : (existing?.checkOut ? new Date(existing.checkOut) : null);

  if (!Number.isInteger(studentId) || studentId <= 0 || !Number.isInteger(bedId) || bedId <= 0) throw new Error("studentId and bedId are required");
  if (!["active", "checked_out", "transferred"].includes(status)) throw new Error("Invalid hostel allocation status");
  if (!Number.isFinite(monthlyFee) || monthlyFee < 0) throw new Error("monthlyFee must be non-negative");
  if (!Number.isFinite(checkIn.getTime()) || (checkOut && (!Number.isFinite(checkOut.getTime()) || checkOut < checkIn))) throw new Error("Invalid hostel allocation date range");

  const student = await Student.findByPk(studentId);
  if (!student || (branchId != null && Number(student.branchId) !== Number(branchId))) throw new Error("Student does not belong to your branch");

  const bed = await Bed.findByPk(bedId);
  if (!bed || (branchId != null && Number(bed.branchId) !== Number(branchId))) throw new Error("Selected bed does not belong to your branch");
  const changingBed = !existing || Number(existing.bedId) !== bedId;
  if (changingBed && bed.status !== "available") throw new Error("Selected bed is not available");

  const room = await Room.findByPk(bed.roomId);
  if (!room || (branchId != null && Number(room.branchId) !== Number(branchId))) throw new Error("Room does not belong to your branch");
  const hostel = await Hostel.findByPk(room.hostelId);
  if (!hostel || hostel.isActive === false || (branchId != null && Number(hostel.branchId) !== Number(branchId))) throw new Error("Hostel does not belong to your branch or is inactive");

  const activeBed = await HostelAllocation.findOne({ where: { bedId, status: "active", ...(existing?.id ? { id: { [Op.ne]: existing.id } } : {}) } });
  if (status === "active" && activeBed) throw new Error("Selected bed is already allocated");

  const activeStudent = status === "active"
    ? await HostelAllocation.findOne({ where: { studentId, status: "active", ...(existing?.id ? { id: { [Op.ne]: existing.id } } : {}) } })
    : null;
  if (activeStudent) throw new Error("Student already has an active hostel allocation");

  body.studentId = studentId; body.bedId = bedId; body.roomId = room.id; body.hostelId = hostel.id;
  body.status = status; body.monthlyFee = monthlyFee; body.checkIn = checkIn; body.checkOut = checkOut; body.branchId = branchId;
  return body;
};

const validateCertificate = async (body: any, req: Request) => {
  const existing = await getExisting(Certificate, req);
  const studentId = Number(body.studentId ?? existing?.studentId);
  const certNo = String(body.certNo ?? existing?.certNo ?? "").trim();
  const type = String(body.type ?? existing?.type ?? "");
  const issuedOn = body.issuedOn !== undefined ? new Date(body.issuedOn) : (existing?.issuedOn ? new Date(existing.issuedOn) : new Date());
  const branchId = req.user?.branchId;
  if (!certNo || !Number.isInteger(studentId) || studentId <= 0) throw new Error("certNo and studentId are required");
  if (!["transfer", "character", "bonafide", "provisional", "mark_sheet"].includes(type)) throw new Error("Invalid certificate type");
  if (!Number.isFinite(issuedOn.getTime())) throw new Error("Invalid issuedOn date");
  const student = await Student.findByPk(studentId);
  if (!student || (branchId != null && Number(student.branchId) !== Number(branchId))) throw new Error("Student does not belong to your branch");
  const duplicate = await Certificate.findOne({ where: { certNo, ...(existing?.id ? { id: { [Op.ne]: existing.id } } : {}) } });
  if (duplicate) throw new Error("Certificate number already exists");
  body.studentId = studentId; body.certNo = certNo; body.type = type; body.issuedOn = issuedOn; body.branchId = branchId;
  return body;
};

const validateTeachingPlan = async (body: any, req: Request) => {
  const isLessonPlan = !!body?.__lessonPlan;
  const model = isLessonPlan ? LessonPlan : Syllabus;
  const existing = await getExisting(model, req);
  const branchId = Number(req.user?.branchId);
  if (!Number.isInteger(branchId) || branchId <= 0) throw ApiError.badRequest("User is not assigned to a branch");

  const title = String(body.title ?? existing?.title ?? "").trim();
  const classId = Number(body.classId ?? existing?.classId);
  const subjectRaw = body.subjectId !== undefined ? body.subjectId : existing?.subjectId;
  const subjectId = subjectRaw === null || subjectRaw === "" || subjectRaw === undefined ? null : Number(subjectRaw);
  const dateField = isLessonPlan ? "plannedDate" : "publishedAt";
  const dateRaw = body[dateField] !== undefined ? body[dateField] : existing?.[dateField];
  const plannedDate = dateRaw ? new Date(dateRaw) : null;

  if (!title) throw ApiError.badRequest("Title is required");
  if (title.length > 180) throw ApiError.badRequest("Title must be 180 characters or fewer");
  if (!Number.isInteger(classId) || classId <= 0) throw ApiError.badRequest("classId is required");

  const schoolClass = await SchoolClass.findOne({ where: { id: classId, branchId } });
  if (!schoolClass || !schoolClass.isActive) {
    throw ApiError.badRequest("Class not found, inactive, or outside your branch");
  }

  if (subjectId !== null) {
    if (!Number.isInteger(subjectId) || subjectId <= 0) throw ApiError.badRequest("Invalid subjectId");
    const subject = await Subject.findOne({ where: { id: subjectId, branchId } });
    if (!subject || !subject.isActive) {
      throw ApiError.badRequest("Subject not found, inactive, or outside your branch");
    }
    const assigned = await ClassSubject.findOne({ where: { classId, subjectId, branchId } });
    if (!assigned) throw ApiError.badRequest("Subject is not assigned to the selected class");
  }

  if (dateRaw !== undefined && dateRaw !== null && dateRaw !== "" && !Number.isFinite(plannedDate!.getTime())) {
    throw ApiError.badRequest(`Invalid ${dateField}`);
  }

  if (isLessonPlan && body.teacherId !== undefined) {
    const teacherId = Number(body.teacherId);
    if (!Number.isInteger(teacherId) || teacherId <= 0) throw ApiError.badRequest("Invalid teacherId");
    const teacher = await Teacher.findOne({ where: { id: teacherId, branchId } });
    if (!teacher || !teacher.isActive) throw ApiError.badRequest("Teacher not found, inactive, or outside your branch");
    body.teacherId = teacherId;
  }

  delete body.__lessonPlan;
  body.title = title;
  body.classId = classId;
  body.subjectId = subjectId;
  if (dateRaw !== undefined) body[dateField] = plannedDate;
  body.branchId = branchId;
  return body;
};
const validateHealthRecord = async (body: any, req: Request) => {
  const existing = await getExisting(HealthRecord, req);
  const studentId = Number(body.studentId ?? existing?.studentId);
  const branchId = req.user?.branchId;
  if (!Number.isInteger(studentId) || studentId <= 0) throw new Error("studentId is required");
  const student = await Student.findByPk(studentId);
  if (!student || (branchId != null && Number(student.branchId) !== Number(branchId))) throw new Error("Student does not belong to your branch");
  body.studentId = studentId; body.branchId = branchId;
  if (body.lastCheckup !== undefined && body.lastCheckup) {
    const d = new Date(body.lastCheckup); if (!Number.isFinite(d.getTime())) throw new Error("Invalid lastCheckup date"); body.lastCheckup = d;
  }
  return body;
};

const validateComplaint = async (body: any, req: Request) => {
  const existing = await getExisting(Complaint, req);
  const title = String(body.title ?? existing?.title ?? "").trim();
  const description = String(body.description ?? existing?.description ?? "").trim();
  const category = String(body.category ?? existing?.category ?? "");
  const status = String(body.status ?? existing?.status ?? "open");
  const priority = String(body.priority ?? existing?.priority ?? "low");
  const branchId = req.user?.branchId;
  if (!title || !description) throw new Error("Complaint title and description are required");
  if (!["grievance", "harassment", "infrastructure", "other"].includes(category)) throw new Error("Invalid complaint category");
  if (!["open", "in_progress", "resolved", "closed", "rejected"].includes(status)) throw new Error("Invalid complaint status");
  if (!["low", "medium", "high", "urgent"].includes(priority)) throw new Error("Invalid complaint priority");
  const assignedTo = body.assignedTo ?? existing?.assignedTo;
  if (assignedTo != null) {
    const user = await User.findByPk(Number(assignedTo));
    if (!user || !user.isActive || (branchId != null && Number(user.branchId) !== Number(branchId))) throw new Error("Assigned user does not belong to your branch");
    body.assignedTo = Number(assignedTo);
  }
  body.title = title; body.description = description; body.category = category; body.status = status; body.priority = priority; body.branchId = branchId;
  if (status === "resolved" || status === "closed") body.resolvedAt = body.resolvedAt ? new Date(body.resolvedAt) : (existing?.resolvedAt ?? new Date());
  return body;
};

const validateRole = async (body: any, req: Request) => {
  const existing = await getExisting(Role, req);
  const name = String(body.name ?? existing?.name ?? "").trim().toLowerCase();
  const label = String(body.label ?? existing?.label ?? name).trim();
  if (!name) throw new Error("Role name is required");
  if (!/^[a-z][a-z0-9_-]{1,49}$/.test(name)) throw new Error("Invalid role name");
  const duplicate = await Role.findOne({ where: { name, ...(existing?.id ? { id: { [Op.ne]: existing.id } } : {}) } });
  if (duplicate) throw new Error("Role name already exists");
  if (existing?.isSystem) {
    if (body.name !== undefined && name !== existing.name) throw new Error("System role name cannot be changed");
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
  if (!name) throw new Error("Branch name is required");
  if (code && !/^[A-Za-z0-9_-]{1,50}$/.test(code)) throw new Error("Invalid branch code");
  if (email && !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) throw new Error("Invalid branch email");
  const duplicate = await Branch.findOne({
    where: { name, ...(existing?.id ? { id: { [Op.ne]: existing.id } } : {}) },
  });
  if (duplicate) throw new Error("Branch name already exists");
  if (code) {
    const codeDuplicate = await Branch.findOne({ where: { code, ...(existing?.id ? { id: { [Op.ne]: existing.id } } : {}) } });
    if (codeDuplicate) throw new Error("Branch code already exists");
  }
  body.name = name;
  body.code = code || null;
  body.email = email || null;
  body.phone = phone || null;
  body.isActive = isActive;
  return body;
};

const validateBook = async (body: any, req: Request) => {
  const existing = await getExisting(Book, req);
  const branchId = req.user?.branchId;
  const isbn = String(body.isbn ?? existing?.isbn ?? "").trim();
  const title = String(body.title ?? existing?.title ?? "").trim();
  const copies = Number(body.copies ?? existing?.copies ?? 1);
  const price = Number(body.price ?? existing?.price ?? 0);
  if (!isbn || !title) throw new Error("ISBN and title are required");
  if (!Number.isInteger(copies) || copies < 0) throw new Error("copies must be a non-negative integer");
  if (!Number.isFinite(price) || price < 0) throw new Error("price must be non-negative");
  const duplicate = await Book.findOne({ where: { isbn, ...(branchId != null ? { branchId } : {}), ...(existing?.id ? { id: { [Op.ne]: existing.id } } : {}) } });
  if (duplicate) throw new Error("ISBN already exists in this branch");
  body.isbn = isbn; body.title = title; body.copies = copies; body.price = price; body.branchId = branchId;
  return body;
};

const validateBookCopy = async (body: any, req: Request) => {
  const existing = await getExisting(BookCopy, req);
  const branchId = req.user?.branchId;
  const bookId = Number(body.bookId ?? existing?.bookId);
  const accessionNo = String(body.accessionNo ?? existing?.accessionNo ?? "").trim();
  if (!Number.isInteger(bookId) || bookId <= 0 || !accessionNo) throw new Error("bookId and accessionNo are required");
  const book = await Book.findByPk(bookId);
  if (!book || (branchId != null && Number(book.branchId) !== Number(branchId))) throw new Error("Book does not belong to your branch");
  const duplicate = await BookCopy.findOne({ where: { accessionNo, ...(branchId != null ? { branchId } : {}), ...(existing?.id ? { id: { [Op.ne]: existing.id } } : {}) } });
  if (duplicate) throw new Error("Accession number already exists in this branch");
  if (body.status !== undefined && !["available","issued","reserved","damaged","lost"].includes(String(body.status))) throw new Error("Invalid copy status");
  body.bookId = bookId; body.accessionNo = accessionNo; body.branchId = branchId;
  if (existing) delete body.status;
  return body;
};

const validateBookFine = async (body: any, req: Request) => {
  const existing = await getExisting(BookFine, req);
  const branchId = req.user?.branchId;
  const issueId = Number(body.bookIssueId ?? existing?.bookIssueId);
  const userId = Number(body.userId ?? existing?.userId);
  const amount = Number(body.amount ?? existing?.amount);
  const issue = await BookIssue.findByPk(issueId);
  if (!issue || (branchId != null && Number(issue.branchId) !== Number(branchId))) throw new Error("Book issue does not belong to your branch");
  if (!Number.isInteger(userId) || userId <= 0) throw new Error("userId is required");
  const user = await User.findByPk(userId);
  if (!user || (branchId != null && Number(user.branchId) !== Number(branchId))) throw new Error("User does not belong to your branch");
  if (!Number.isFinite(amount) || amount < 0) throw new Error("Fine amount must be non-negative");
  body.bookIssueId = issueId; body.userId = userId; body.amount = amount; body.branchId = branchId;
  return body;
};

export const RESOURCES: ResourceDefinition[] = [
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
  { path: "parents", model: Parent, searchable: ["fullName", "phone", "email"], permission: "students", beforeCreate: validateParentProfile, beforeUpdate: validateParentProfile },
  { path: "teachers", model: Teacher, searchable: ["staffNo", "firstName", "lastName", "email"], permission: "teachers", beforeCreate: (body, req) => validateStaffProfile(body, req, Teacher, "teacher"), beforeUpdate: (body, req) => validateStaffProfile(body, req, Teacher, "teacher") },
  { path: "staff", model: Staff, searchable: ["staffNo", "firstName", "lastName", "department"], permission: "staff", beforeCreate: (body, req) => validateStaffProfile(body, req, Staff, "staff"), beforeUpdate: (body, req) => validateStaffProfile(body, req, Staff, "staff") },
  { path: "exams", model: Exam, searchable: ["name", "examType", "status"], permission: "exams", beforeCreate: validateExam, beforeUpdate: validateExam },
  {
    path: "exam-schedules", model: ExamSchedule, searchable: ["room", "startTime"], permission: "exams",
    beforeCreate: validateExamSchedule,
    beforeUpdate: validateExamSchedule,
  },
  {
    path: "exam-results", model: ExamResult, searchable: ["grade", "remarks"], permission: "exam-results",
    beforeCreate: validateExamResult,
    beforeUpdate: validateExamResult,
  },
  {
    path: "report-cards", model: ReportCard, searchable: ["grade"], permission: "exam-results",
    // studentId is required by the model but not on the form — derive it from the enrolment.
    beforeCreate: validateReportCard,
    beforeUpdate: validateReportCard,
  },
  { path: "assignments", model: Assignment, searchable: ["title", "description"], permission: "assignments", beforeCreate: validateAssignment, beforeUpdate: validateAssignment },
  { path: "submissions", model: Submission, searchable: ["status"], permission: "assignments", beforeCreate: validateSubmission, beforeUpdate: validateSubmission },
  { path: "gradebook", model: GradebookEntry, searchable: ["grade"], permission: "gradebook", beforeCreate: validateGradebook, beforeUpdate: validateGradebook },
  { path: "grade-scales", model: GradeScale, searchable: ["name", "grade"], permission: "gradebook", beforeCreate: validateGradeScale, beforeUpdate: validateGradeScale },
  { path: "timetable", model: Timetable, searchable: ["name"], permission: "timetable", beforeCreate: validateTimetable, beforeUpdate: validateTimetable },
  { path: "periods", model: Period, searchable: ["dayOfWeek", "room"], permission: "timetable", beforeCreate: validatePeriod, beforeUpdate: validatePeriod },
  { path: "fee-types", model: FeeType, searchable: ["name", "category"], permission: "fees", beforeCreate: validateFeeType, beforeUpdate: validateFeeType },
  { path: "expenses", model: Expense, searchable: ["title", "category", "status"], permission: "expenses", beforeCreate: validateExpense, beforeUpdate: validateExpense },
  {
    path: "payroll", model: PayrollItem, searchable: ["month", "status"], permission: "payroll",
    beforeCreate: async (body, req) => {
      const month = String(body.month ?? "").trim();
      const branchId = req.user?.branchId;
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("month must be in YYYY-MM format");
      const payeeType = body.payeeType === "staff" ? "staff" : body.payeeType === "teacher" ? "teacher" : null;
      if (!payeeType) throw new Error("payeeType must be teacher or staff");
      const teacherId = body.teacherId ? Number(body.teacherId) : null;
      const staffId = body.staffId ? Number(body.staffId) : null;
      if ((payeeType === "teacher" && (!teacherId || staffId)) || (payeeType === "staff" && (!staffId || teacherId))) {
        throw new Error("Payroll must reference exactly one matching teacher or staff member");
      }
      const payee = payeeType === "teacher"
        ? await Teacher.findByPk(teacherId as number, { include: [{ model: User, where: branchId != null ? { branchId } : undefined, required: branchId != null }] })
        : await Staff.findByPk(staffId as number, { include: [{ model: User, where: branchId != null ? { branchId } : undefined, required: branchId != null }] });
      if (!payee || !payee.isActive) throw new Error("Selected payroll payee is not active or does not belong to your branch");
      const duplicate = await PayrollItem.findOne({ where: { ...(branchId != null ? { branchId } : {}), ...(payeeType === "teacher" ? { teacherId } : { staffId }), month } });
      if (duplicate) throw new Error("Payroll already exists for this payee and month");
      const basicSalary = Number(body.basicSalary);
      const allowances = Number(body.allowances ?? 0);
      const deductions = Number(body.deductions ?? 0);
      if (!Number.isFinite(basicSalary) || basicSalary < 0 || !Number.isFinite(allowances) || allowances < 0 || !Number.isFinite(deductions) || deductions < 0) {
        throw new Error("Salary amounts must be valid non-negative numbers");
      }
      const status = String(body.status ?? "draft");
      if (!["draft", "approved", "paid"].includes(status)) throw new Error("Invalid payroll status");
      if (status === "paid" && !body.paidOn) throw new Error("paidOn is required when payroll status is paid");
      if (body.paidOn && !Number.isFinite(new Date(body.paidOn).getTime())) throw new Error("Invalid paidOn date");
      body.branchId = branchId;
      body.month = month;
      body.payeeType = payeeType;
      body.teacherId = payeeType === "teacher" ? teacherId : null;
      body.staffId = payeeType === "staff" ? staffId : null;
      body.basicSalary = basicSalary;
      body.allowances = allowances;
      body.deductions = deductions;
      body.netPay = basicSalary + allowances - deductions;
      return body;
    },
    beforeUpdate: async (body, req) => {
      const id = Number(req.params.id);
      const current = await PayrollItem.findByPk(id);
      if (!current) throw new Error("Payroll item not found");
      if (req.user?.branchId != null && Number(current.branchId) !== Number(req.user.branchId)) throw new Error("Payroll item does not belong to your branch");
      const branchId = req.user?.branchId;
      const month = String(body.month ?? current.month ?? "").trim();
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("month must be in YYYY-MM format");
      const payeeType = body.payeeType ?? current.payeeType;
      if (payeeType !== "teacher" && payeeType !== "staff") throw new Error("payeeType must be teacher or staff");
      const teacherId = body.teacherId !== undefined ? (body.teacherId ? Number(body.teacherId) : null) : (current.teacherId ?? null);
      const staffId = body.staffId !== undefined ? (body.staffId ? Number(body.staffId) : null) : (current.staffId ?? null);
      if ((payeeType === "teacher" && (!teacherId || staffId)) || (payeeType === "staff" && (!staffId || teacherId))) {
        throw new Error("Payroll must reference exactly one matching teacher or staff member");
      }
      const payee = payeeType === "teacher"
        ? await Teacher.findByPk(teacherId as number, { include: [{ model: User, where: branchId != null ? { branchId } : undefined, required: branchId != null }] })
        : await Staff.findByPk(staffId as number, { include: [{ model: User, where: branchId != null ? { branchId } : undefined, required: branchId != null }] });
      if (!payee || !payee.isActive) throw new Error("Selected payroll payee is not active or does not belong to your branch");
      const duplicate = await PayrollItem.findOne({ where: { ...(branchId != null ? { branchId } : {}), ...(payeeType === "teacher" ? { teacherId } : { staffId }), month, id: { [Op.ne]: id } } });
      if (duplicate) throw new Error("Payroll already exists for this payee and month");
      const basicSalary = Number(body.basicSalary ?? current.basicSalary);
      const allowances = Number(body.allowances ?? current.allowances ?? 0);
      const deductions = Number(body.deductions ?? current.deductions ?? 0);
      if (!Number.isFinite(basicSalary) || basicSalary < 0 || !Number.isFinite(allowances) || allowances < 0 || !Number.isFinite(deductions) || deductions < 0) {
        throw new Error("Salary amounts must be valid non-negative numbers");
      }
      const status = String(body.status ?? current.status);
      if (!["draft", "approved", "paid"].includes(status)) throw new Error("Invalid payroll status");
      if (status === "paid" && !(body.paidOn ?? current.paidOn)) throw new Error("paidOn is required when payroll status is paid");
      if (body.paidOn && !Number.isFinite(new Date(body.paidOn).getTime())) throw new Error("Invalid paidOn date");
      body.branchId = current.branchId ?? branchId;
      body.month = month;
      body.payeeType = payeeType;
      body.teacherId = payeeType === "teacher" ? teacherId : null;
      body.staffId = payeeType === "staff" ? staffId : null;
      body.basicSalary = basicSalary;
      body.allowances = allowances;
      body.deductions = deductions;
      body.netPay = basicSalary + allowances - deductions;
      return body;
    },
  },
  {
    path: "payslips", model: Payslip, searchable: ["payslipNo"], permission: "payroll",
    beforeCreate: async (body, req) => {
      const branchId = req.user?.branchId;
      const payrollItemId = Number(body.payrollItemId);
      if (!Number.isInteger(payrollItemId) || payrollItemId <= 0) throw new Error("payrollItemId is required");
      const item = await PayrollItem.findByPk(payrollItemId);
      if (!item) throw new Error("Payroll item not found");
      if (branchId != null && Number(item.branchId) !== Number(branchId)) throw new Error("Payroll item does not belong to your branch");
      const existing = await Payslip.findOne({ where: { payrollItemId, ...(branchId != null ? { branchId } : {}) } });
      if (existing) throw new Error("A payslip already exists for this payroll item");
      if ((body.gross === undefined || body.gross === null || body.gross === "") || (body.net === undefined || body.net === null || body.net === "")) {
        body.gross = Number(item.basicSalary) + Number(item.allowances ?? 0);
        body.net = Number(item.netPay ?? body.gross);
      }
      const gross = Number(body.gross);
      const net = Number(body.net);
      if (!Number.isFinite(gross) || gross < 0 || !Number.isFinite(net) || net < 0 || net > gross) throw new Error("Payslip gross/net amounts are invalid");
      body.branchId = item.branchId ?? branchId;
      body.gross = gross;
      body.net = net;
      return body;
    },
    beforeUpdate: async (body, req) => {
      const id = Number(req.params.id);
      const current = await Payslip.findByPk(id);
      if (!current) throw new Error("Payslip not found");
      if (req.user?.branchId != null && Number(current.branchId) !== Number(req.user.branchId)) throw new Error("Payslip does not belong to your branch");
      if (body.payrollItemId !== undefined && Number(body.payrollItemId) !== Number(current.payrollItemId)) throw new Error("Payroll item cannot be changed on a payslip");
      const gross = Number(body.gross ?? current.gross);
      const net = Number(body.net ?? current.net);
      if (!Number.isFinite(gross) || gross < 0 || !Number.isFinite(net) || net < 0 || net > gross) throw new Error("Payslip gross/net amounts are invalid");
      body.payrollItemId = current.payrollItemId;
      body.branchId = current.branchId ?? req.user?.branchId;
      body.gross = gross;
      body.net = net;
      return body;
    },
  },
  {
    path: "leaves", model: LeaveRequest, searchable: ["leaveType", "status"], permission: "leaves",
    beforeCreate: async (body, req) => {
      const userId = Number(req.user?.id);
      const branchId = req.user?.branchId;
      const leaveType = String(body.leaveType ?? "").trim().toLowerCase();
      const startDate = new Date(body.startDate);
      const endDate = new Date(body.endDate);
      if (!userId) throw new Error("Authenticated user is required");
      if (!["sick", "casual", "annual", "unpaid", "maternity"].includes(leaveType)) throw new Error("Invalid leave type");
      if (!Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime()) || endDate < startDate) throw new Error("Invalid leave date range");
      const days = Math.floor((Date.UTC(endDate.getFullYear(), endDate.getMonth(), endDate.getDate()) - Date.UTC(startDate.getFullYear(), startDate.getMonth(), startDate.getDate())) / 86400000) + 1;
      const user = await User.findByPk(userId);
      if (!user || !user.isActive) throw new Error("User is not active");
      if (branchId != null && Number(user.branchId) !== Number(branchId)) throw new Error("User does not belong to your branch");
      const overlap = await LeaveRequest.findOne({
        where: {
          userId,
          ...(branchId != null ? { branchId } : {}),
          status: { [Op.in]: ["pending", "approved"] },
          startDate: { [Op.lte]: endDate },
          endDate: { [Op.gte]: startDate },
        },
      });
      if (overlap) throw new Error("An overlapping pending or approved leave already exists");
      body.userId = userId;
      body.branchId = branchId;
      body.leaveType = leaveType;
      body.startDate = startDate;
      body.endDate = endDate;
      body.days = days;
      body.status = "pending";
      delete body.processedBy;
      return body;
    },
    beforeUpdate: async (body, req) => {
      const id = Number(req.params.id);
      const current = await LeaveRequest.findByPk(id);
      if (!current) throw new Error("Leave request not found");
      if (req.user?.branchId != null && Number(current.branchId) !== Number(req.user.branchId)) throw new Error("Leave request does not belong to your branch");
      const startDate = body.startDate !== undefined ? new Date(body.startDate) : new Date(current.startDate);
      const endDate = body.endDate !== undefined ? new Date(body.endDate) : new Date(current.endDate);
      const days = Number(body.days ?? current.days);
      const leaveType = String(body.leaveType ?? current.leaveType).trim().toLowerCase();
      const status = String(body.status ?? current.status).toLowerCase();
      if (!["sick", "casual", "annual", "unpaid", "maternity"].includes(leaveType)) throw new Error("Invalid leave type");
      if (!Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime()) || endDate < startDate) throw new Error("Invalid leave date range");
      if (!Number.isFinite(days) || days <= 0) throw new Error("days must be greater than 0");
      if (!["pending", "approved", "rejected", "cancelled"].includes(status)) throw new Error("Invalid leave status");
      const overlap = await LeaveRequest.findOne({
        where: {
          userId: current.userId,
          ...(req.user?.branchId != null ? { branchId: req.user.branchId } : {}),
          status: { [Op.in]: ["pending", "approved"] },
          startDate: { [Op.lte]: endDate },
          endDate: { [Op.gte]: startDate },
          id: { [Op.ne]: id },
        },
      });
      if (overlap && status !== "rejected" && status !== "cancelled") throw new Error("An overlapping pending or approved leave already exists");
      body.userId = current.userId;
      body.branchId = current.branchId ?? req.user?.branchId;
      body.leaveType = leaveType;
      body.startDate = startDate;
      body.endDate = endDate;
      body.days = days;
      if (status !== "pending") {
        body.processedBy = req.user?.id;
      } else {
        delete body.processedBy;
      }
      body.status = status;
      return body;
    },
  },
  { path: "books", model: Book, searchable: ["title", "author", "isbn", "category"], permission: "library" },
  { path: "book-copies", model: BookCopy, searchable: ["accessionNo", "status"], permission: "library", beforeCreate: validateBookCopy, beforeUpdate: validateBookCopy },
  { path: "book-fines", model: BookFine, searchable: ["receiptNo", "status"], permission: "book-fines" },
  { path: "routes", model: Route, searchable: ["name", "startPoint", "endPoint"], permission: "routes", beforeCreate: validateRoute, beforeUpdate: validateRoute },
  { path: "route-stops", model: RouteStop, searchable: ["name"], permission: "route-stops", beforeCreate: validateRouteStop, beforeUpdate: validateRouteStop },
  { path: "vehicles", model: Vehicle, searchable: ["registrationNo", "model"], permission: "vehicles", beforeCreate: validateVehicle, beforeUpdate: validateVehicle },
  {
    path: "driver-assignments", model: DriverAssignment, searchable: [], permission: "driver-assignments",
    beforeCreate: async (body, req) => {
      if (!body.vehicleId || !body.driverId) throw new Error("vehicleId and driverId are required");
      const vehicle = await Vehicle.findByPk(body.vehicleId);
      if (!vehicle) throw new Error("Vehicle not found");
      if (vehicle.status !== "active") throw new Error("Selected vehicle is not active");
      const driver = await User.findByPk(body.driverId);
      if (!driver || !driver.isActive) throw new Error("Selected driver is not active");
      if (body.routeId) {
        const route = await Route.findByPk(body.routeId);
        if (!route || !route.isActive) throw new Error("Selected route is not active");
        if (req.user?.branchId != null && Number(route.branchId) !== Number(req.user.branchId)) {
          throw new Error("Selected route does not belong to your branch");
        }
      }
      const activeVehicle = await DriverAssignment.findOne({ where: { vehicleId: body.vehicleId, isActive: true } });
      if (activeVehicle) throw new Error("Vehicle already has an active driver assignment");
      const activeDriver = await DriverAssignment.findOne({ where: { driverId: body.driverId, isActive: true } });
      if (activeDriver) throw new Error("Driver already has an active vehicle assignment");
      const assignedOn = body.assignedOn ? new Date(body.assignedOn) : new Date();
      if (!Number.isFinite(assignedOn.getTime())) throw new Error("Invalid assignedOn date");
      body.assignedOn = assignedOn;
      body.isActive = body.isActive !== false;
      return body;
    },
    beforeUpdate: async (body, req) => {
      const id = Number(req.params.id);
      const current = await DriverAssignment.findByPk(id);
      if (!current) throw new Error("Driver assignment not found");
      const vehicleId = body.vehicleId ?? current.vehicleId;
      const driverId = body.driverId ?? current.driverId;
      const vehicle = await Vehicle.findByPk(vehicleId);
      const driver = await User.findByPk(driverId);
      if (!vehicle || vehicle.status !== "active") throw new Error("Selected vehicle is not active");
      if (!driver || !driver.isActive) throw new Error("Selected driver is not active");
      const routeId = body.routeId ?? current.routeId;
      if (routeId) {
        const route = await Route.findByPk(routeId);
        if (!route || !route.isActive) throw new Error("Selected route is not active");
        if (req.user?.branchId != null && Number(route.branchId) !== Number(req.user.branchId)) {
          throw new Error("Selected route does not belong to your branch");
        }
      }
      const nextActive = body.isActive !== undefined ? Boolean(body.isActive) : current.isActive;
      if (nextActive) {
        const vehicleConflict = await DriverAssignment.findOne({ where: { vehicleId, isActive: true, id: { [Op.ne]: id } } });
        if (vehicleConflict) throw new Error("Vehicle already has another active driver assignment");
        const driverConflict = await DriverAssignment.findOne({ where: { driverId, isActive: true, id: { [Op.ne]: id } } });
        if (driverConflict) throw new Error("Driver already has another active vehicle assignment");
      }
      const assignedOn = body.assignedOn !== undefined ? new Date(body.assignedOn) : new Date(current.assignedOn);
      if (!Number.isFinite(assignedOn.getTime())) throw new Error("Invalid assignedOn date");
      body.assignedOn = assignedOn;
      return body;
    },
  },
  {
    path: "student-transport", model: StudentTransport, searchable: [], permission: "student-transport",
    beforeCreate: async (body, req) => {
      const student = await Student.findByPk(body.studentId);
      if (!student) throw new Error("Student not found");
      if (req.user?.branchId != null && Number(student.branchId) !== Number(req.user.branchId)) {
        throw new Error("Selected student does not belong to your branch");
      }
      const route = await Route.findByPk(body.routeId);
      if (!route || !route.isActive) throw new Error("Selected route is not active");
      if (req.user?.branchId != null && Number(route.branchId) !== Number(req.user.branchId)) {
        throw new Error("Selected route does not belong to your branch");
      }
      if (body.stopId) {
        const stop = await RouteStop.findByPk(body.stopId);
        if (!stop || Number(stop.routeId) !== Number(body.routeId)) throw new Error("Selected stop does not belong to the selected route");
      }
      if (body.vehicleId) {
        const vehicle = await Vehicle.findByPk(body.vehicleId);
        if (!vehicle || vehicle.status !== "active") throw new Error("Selected vehicle is not active");
      }
      const active = await StudentTransport.findOne({ where: { studentId: body.studentId, isActive: true } });
      if (active) throw new Error("Student already has an active transport assignment");
      const start = body.startDate ? new Date(body.startDate) : new Date();
      const end = body.endDate ? new Date(body.endDate) : null;
      if (!Number.isFinite(start.getTime()) || (end && (!Number.isFinite(end.getTime()) || end < start))) {
        throw new Error("Invalid transport date range");
      }
      body.startDate = start;
      body.endDate = end;
      body.isActive = true;
      return body;
    },
    beforeUpdate: async (body, req) => {
      const id = Number(req.params.id);
      const current = await StudentTransport.findByPk(id);
      if (!current) throw new Error("Student transport assignment not found");
      const studentId = body.studentId ?? current.studentId;
      const routeId = body.routeId ?? current.routeId;
      const student = await Student.findByPk(studentId);
      const route = await Route.findByPk(routeId);
      if (!student || !route) throw new Error("Student or route not found");
      if (req.user?.branchId != null && (Number(student.branchId) !== Number(req.user.branchId) || Number(route.branchId) !== Number(req.user.branchId))) {
        throw new Error("Student or route does not belong to your branch");
      }
      if (body.stopId) {
        const stop = await RouteStop.findByPk(body.stopId);
        if (!stop || Number(stop.routeId) !== Number(routeId)) throw new Error("Selected stop does not belong to the selected route");
      }
      if (body.vehicleId) {
        const vehicle = await Vehicle.findByPk(body.vehicleId);
        if (!vehicle || vehicle.status !== "active") throw new Error("Selected vehicle is not active");
      }
      const nextActive = body.isActive !== undefined ? Boolean(body.isActive) : current.isActive;
      if (nextActive) {
        const duplicate = await StudentTransport.findOne({ where: { studentId, isActive: true, id: { [Op.ne]: id } } });
        if (duplicate) throw new Error("Student already has another active transport assignment");
      }
      const start = body.startDate !== undefined ? new Date(body.startDate) : new Date(current.startDate);
      const end = body.endDate !== undefined ? (body.endDate ? new Date(body.endDate) : null) : (current.endDate ? new Date(current.endDate) : null);
      if (!Number.isFinite(start.getTime()) || (end && (!Number.isFinite(end.getTime()) || end < start))) throw new Error("Invalid transport date range");
      body.startDate = start;
      body.endDate = end;
      return body;
    },
  },
  { path: "hostels", model: Hostel, searchable: ["name", "wardenName"], permission: "hostels", beforeCreate: validateHostel, beforeUpdate: validateHostel },
  {
    path: "rooms", model: Room, searchable: ["roomNo", "floor"], permission: "rooms",
    includes: [{ association: "hostel", attributes: ["id", "name"] }],
    beforeCreate: validateRoom, beforeUpdate: validateRoom,
    decorate: (row) => {
      const p = plain(row);
      p.hostelName = p.hostel?.name ?? "";
      return p;
    },
  },
  {
    path: "beds", model: Bed, searchable: ["bedNo"], permission: "beds",
    includes: [{ association: "room", attributes: ["id", "roomNo"] }],
    beforeCreate: validateBed, beforeUpdate: validateBed,
    decorate: (row) => {
      const p = plain(row);
      p.roomNo = p.room?.roomNo ?? "";
      return p;
    },
  },
  {
    path: "hostel-allocations", model: HostelAllocation, searchable: ["status"], permission: "hostel-allocations",
    includes: [
      { association: "student", attributes: ["id", "firstName", "lastName", "admissionNo"] },
      { association: "hostel", attributes: ["id", "name"] },
      { association: "room", attributes: ["id", "roomNo"] },
      { association: "bed", attributes: ["id", "bedNo"] },
    ],
    decorate: (row) => {
      const p = plain(row);
      p.studentName = p.student ? `${p.student.firstName} ${p.student.lastName}`.trim() : "";
      p.admissionNo = p.student?.admissionNo ?? "";
      p.hostelName = p.hostel?.name ?? "";
      p.roomNo = p.room?.roomNo ?? "";
      p.bedNo = p.bed?.bedNo ?? "";
      return p;
    },
    beforeCreate: validateHostelAllocation,
    beforeUpdate: validateHostelAllocation,
  },
  { path: "events", model: Event, searchable: ["title", "category", "venue"], permission: "events" },
  { path: "notices", model: Notice, searchable: ["title", "type"], permission: "notices" },
  { path: "announcements", model: Announcement, searchable: ["title", "priority"], permission: "announcements" },
  {
    path: "messages", model: Message, searchable: ["subject"], permission: "messages",
    beforeCreate: async (body, req) => {
      const senderId = Number(req.user?.id);
      const branchId = req.user?.branchId;
      if (!senderId) throw new Error("Authenticated sender is required");
      const sender = await User.findByPk(senderId);
      if (!sender || !sender.isActive) throw new Error("Sender is not active");
      if (branchId != null && Number(sender.branchId) !== Number(branchId)) throw new Error("Sender does not belong to your branch");
      const kind = String(body.kind ?? "direct").trim().toLowerCase();
      if (!["direct", "broadcast", "group"].includes(kind)) throw new Error("Invalid message kind");
      const messageBody = String(body.body ?? "").trim();
      if (!messageBody) throw new Error("Message body is required");
      body.senderId = senderId;
      body.branchId = branchId;
      body.kind = kind;
      body.body = messageBody;
      body.isGroup = kind === "group";
      return body;
    },
    beforeUpdate: async (body, req) => {
      const current = await Message.findByPk(req.params.id);
      if (!current) throw new Error("Message not found");
      if (req.user?.branchId != null && Number(current.branchId) !== Number(req.user.branchId)) throw new Error("Message does not belong to your branch");
      delete body.senderId;
      body.branchId = current.branchId ?? req.user?.branchId;
      if (body.kind !== undefined) {
        const kind = String(body.kind).trim().toLowerCase();
        if (!["direct", "broadcast", "group"].includes(kind)) throw new Error("Invalid message kind");
        body.kind = kind;
        body.isGroup = kind === "group";
      }
      if (body.body !== undefined && !String(body.body).trim()) throw new Error("Message body is required");
      return body;
    },
  },
  { path: "notifications", model: Notification, searchable: ["title"], permission: "notifications", readonly: true },
  { path: "syllabus", model: Syllabus, searchable: ["title"], permission: "syllabus", beforeCreate: (body, req) => validateTeachingPlan(body, req), beforeUpdate: (body, req) => validateTeachingPlan(body, req) },
  { path: "lesson-plans", model: LessonPlan, searchable: ["title"], permission: "lesson-plans", beforeCreate: (body, req) => validateTeachingPlan({ ...body, __lessonPlan: true }, req), beforeUpdate: (body, req) => validateTeachingPlan({ ...body, __lessonPlan: true }, req) },
  { path: "health-records", model: HealthRecord, searchable: ["bloodGroup"], permission: "health-records", beforeCreate: validateHealthRecord, beforeUpdate: validateHealthRecord },
  {
    path: "discipline-records", model: DisciplineRecord, searchable: ["title", "type", "status"], permission: "discipline-records",
    beforeCreate: validateDiscipline,
    beforeUpdate: (body, req) => validateDiscipline(body, req),
  },
  {
    path: "complaints", model: Complaint, searchable: ["title", "category", "status"], permission: "complaints",
    beforeCreate: (body, req) => {
      body.submittedBy = req.user?.id;
      return body;
    },
    beforeUpdate: (body) => {
      delete body.submittedBy;
      return body;
    },
  },
  {
    path: "inventory", model: InventoryItem, searchable: ["name", "sku", "category"], permission: "inventory",
    beforeCreate: validateInventory,
    beforeUpdate: validateInventory,
  },
  {
    path: "assets", model: Asset, searchable: ["name", "assetCode", "category"], permission: "inventory",
    beforeCreate: validateAsset,
    beforeUpdate: validateAsset,
  },
  { path: "audit-logs", model: AuditLog, searchable: ["action", "entity"], permission: "audit-logs", readonly: true },
  {
    path: "visitor-logs", model: VisitorLog, searchable: ["visitorName", "purpose"], permission: "visitors",
    beforeCreate: (body, req) => {
      const checkedIn = body.checkedIn ? new Date(body.checkedIn) : new Date();
      if (!Number.isFinite(checkedIn.getTime())) throw new Error("Invalid checkedIn date");
      const checkedOut = body.checkedOut ? new Date(body.checkedOut) : null;
      if (checkedOut && (!Number.isFinite(checkedOut.getTime()) || checkedOut < checkedIn)) {
        throw new Error("checkedOut must be after checkedIn");
      }
      body.checkedIn = checkedIn;
      body.checkedOut = checkedOut;
      body.registeredBy = req.user?.id;
      return body;
    },
    beforeUpdate: async (body, req) => {
      const current = await VisitorLog.findByPk(req.params.id);
      if (!current) throw new Error("Visitor log not found");
      const checkedIn = body.checkedIn !== undefined ? new Date(body.checkedIn) : new Date(current.checkedIn);
      const checkedOut = body.checkedOut !== undefined ? (body.checkedOut ? new Date(body.checkedOut) : null) : (current.checkedOut ? new Date(current.checkedOut) : null);
      if (!Number.isFinite(checkedIn.getTime()) || (checkedOut && (!Number.isFinite(checkedOut.getTime()) || checkedOut < checkedIn))) {
        throw new Error("Invalid visitor check-in/check-out time");
      }
      body.checkedIn = checkedIn;
      body.checkedOut = checkedOut;
      delete body.registeredBy;
      return body;
    },
  },
];