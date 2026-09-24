import { Request } from "express";
import { Op } from "sequelize";
import {
  Role, Permission, Branch, AcademicYear, Term, SchoolClass, Section, Subject, Student,
  ClassSubject, Enrolment, Parent, Teacher, Staff, Exam, ExamSchedule, ExamResult,
  ReportCard, Assignment, Submission, GradebookEntry, GradeScale, Timetable, Period,
  FeeType, Expense, PayrollItem, Payslip, LeaveRequest, Book, BookCopy, BookFine,
  Route, RouteStop, Vehicle, DriverAssignment, StudentTransport, Hostel, Room, Bed,
  HostelAllocation, Event, Notice, Announcement, Message, Notification, Syllabus,
  LessonPlan, HealthRecord, DisciplineRecord, Complaint, InventoryItem, Asset,
  AuditLog, VisitorLog, User,
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

const validateAcademicYear = async (body: any, req: Request) => {
  const existing = await getExisting(AcademicYear, req);
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
      where: { isCurrent: true, ...(existing?.id ? { id: { [Op.ne]: existing.id } } : {}) },
    });
    if (current) throw new Error("Another academic year is already marked as current");
  }
  body.name = name;
  body.startDate = start;
  body.endDate = end;
  body.isCurrent = isCurrent;
  body.isClosed = isClosed;
  return body;
};

const validateTerm = async (body: any, req: Request) => {
  const existing = await getExisting(Term, req);
  const academicYearId = body.academicYearId ?? existing?.academicYearId;
  if (!academicYearId) throw new Error("academicYearId is required");
  const year = await AcademicYear.findByPk(academicYearId);
  if (!year) throw new Error("Academic year not found");
  const start = body.startDate !== undefined ? new Date(body.startDate) : existing?.startDate;
  const end = body.endDate !== undefined ? new Date(body.endDate) : existing?.endDate;
  if (start && end && (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start >= end)) {
    throw new Error("Term startDate must be before endDate");
  }
  if (start && (start < new Date(year.startDate) || start > new Date(year.endDate))) {
    throw new Error("Term startDate must be within the academic year");
  }
  if (end && (end < new Date(year.startDate) || end > new Date(year.endDate))) {
    throw new Error("Term endDate must be within the academic year");
  }
  return body;
};

const validateEnrolment = async (body: any, req: Request) => {
  const existing = await getExisting(Enrolment, req);
  const classId = Number(body.classId ?? existing?.classId);
  const sectionId = body.sectionId !== undefined ? (body.sectionId ? Number(body.sectionId) : null) : (existing?.sectionId ?? null);
  const studentId = Number(body.studentId ?? existing?.studentId);
  const academicYearId = Number(body.academicYearId ?? existing?.academicYearId);
  const status = String(body.status ?? existing?.status ?? "active");
  const branchId = req.user?.branchId;
  if (!Number.isInteger(studentId) || studentId <= 0 || !Number.isInteger(classId) || classId <= 0 || !Number.isInteger(academicYearId) || academicYearId <= 0) {
    throw new Error("studentId, academicYearId and classId are required");
  }
  if (existing && (Number(existing.studentId) !== studentId || Number(existing.academicYearId) !== academicYearId)) {
    throw new Error("Student and academic year cannot be changed on an existing enrolment");
  }
  if (!["active", "promoted", "graduated", "transferred", "withdrawn", "expelled"].includes(status)) {
    throw new Error("Invalid enrolment status");
  }
  const student = await Student.findByPk(studentId);
  if (!student) throw new Error("Student not found");
  if (branchId != null && Number(student.branchId) !== Number(branchId)) throw new Error("Student does not belong to your branch");
  const schoolClass = await SchoolClass.findByPk(classId);
  if (!schoolClass || !schoolClass.isActive) throw new Error("Class not found or inactive");
  if (branchId != null && Number(schoolClass.branchId) !== Number(branchId)) throw new Error("Class does not belong to your branch");
  if (sectionId) {
    const section = await Section.findByPk(sectionId);
    if (!section || !section.isActive) throw new Error("Section not found or inactive");
    if (Number(section.classId) !== classId) throw new Error("Selected section does not belong to the selected class");
  }
  const year = await AcademicYear.findByPk(academicYearId);
  if (!year) throw new Error("Academic year not found");
  if (year.isClosed && status === "active") throw new Error("A closed academic year cannot have an active enrolment");
  const duplicate = await Enrolment.findOne({
    where: {
      studentId,
      academicYearId,
      status: "active",
      ...(existing?.id ? { id: { [Op.ne]: existing.id } } : {}),
    },
  });
  if (duplicate) throw new Error("Student already has an active enrolment for this academic year");
  body.studentId = studentId;
  body.academicYearId = academicYearId;
  body.classId = classId;
  body.sectionId = sectionId;
  body.status = status;
  body.branchId = branchId;
  return body;
};

const validateExamResult = async (body: any, req: Request) => {
  const existing = await getExisting(ExamResult, req);
  const examId = Number(body.examId ?? existing?.examId);
  const studentId = Number(body.studentId ?? existing?.studentId);
  const subjectId = Number(body.subjectId ?? existing?.subjectId);
  const obtained = Number(body.marksObtained ?? existing?.marksObtained);
  const max = Number(body.maxMarks ?? existing?.maxMarks);
  const branchId = req.user?.branchId;
  if (!Number.isInteger(examId) || examId <= 0 || !Number.isInteger(studentId) || studentId <= 0 || !Number.isInteger(subjectId) || subjectId <= 0) {
    throw new Error("examId, studentId and subjectId are required");
  }
  if (!Number.isFinite(max) || max <= 0) throw new Error("maxMarks must be greater than 0");
  if (!Number.isFinite(obtained) || obtained < 0 || obtained > max) throw new Error("marksObtained must be between 0 and maxMarks");
  const exam = await Exam.findByPk(examId);
  if (!exam) throw new Error("Exam not found");
  const student = await Student.findByPk(studentId);
  if (!student) throw new Error("Student not found");
  if (branchId != null && Number(student.branchId) !== Number(branchId)) throw new Error("Student does not belong to your branch");
  const enrolment = await Enrolment.findOne({
    where: { studentId, academicYearId: exam.academicYearId, ...(branchId != null ? { branchId } : {}), status: { [Op.notIn]: ["withdrawn", "expelled"] } },
  });
  if (!enrolment) throw new Error("Student is not enrolled in the exam academic year");
  const classSubject = await ClassSubject.findOne({ where: { classId: enrolment.classId, subjectId } });
  if (!classSubject) throw new Error("Subject is not assigned to the student's class");
  const duplicate = await ExamResult.findOne({
    where: { examId, studentId, subjectId, ...(existing?.id ? { id: { [Op.ne]: existing.id } } : {}) },
  });
  if (duplicate) throw new Error("Exam result already exists for this student and subject");
  body.examId = examId;
  body.studentId = studentId;
  body.subjectId = subjectId;
  body.maxMarks = max;
  body.marksObtained = obtained;
  body.branchId = branchId;
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
  const examId = body.examId ?? existing?.examId;
  const classId = body.classId ?? existing?.classId;
  const sectionId = body.sectionId ?? existing?.sectionId;
  const subjectId = body.subjectId ?? existing?.subjectId;
  const date = body.date !== undefined ? new Date(body.date) : existing?.date;
  const start = parseTimeMinutes(body.startTime ?? existing?.startTime);
  const end = parseTimeMinutes(body.endTime ?? existing?.endTime);
  if (!examId || !classId || !subjectId) throw new Error("examId, classId and subjectId are required");
  if (start === null || end === null || start >= end) throw new Error("Invalid exam schedule time range");
  if (!date || !Number.isFinite(new Date(date).getTime())) throw new Error("Valid exam date is required");
  const exam = await Exam.findByPk(examId);
  if (!exam) throw new Error("Exam not found");
  if (exam.startDate && date < new Date(exam.startDate)) throw new Error("Exam schedule date is before the exam start date");
  if (exam.endDate && date > new Date(exam.endDate)) throw new Error("Exam schedule date is after the exam end date");
  const section = sectionId ? await Section.findByPk(sectionId) : null;
  if (sectionId && (!section || Number(section.classId) !== Number(classId))) {
    throw new Error("Selected section does not belong to the selected class");
  }
  const schoolClass = await SchoolClass.findByPk(classId);
  if (!schoolClass || !schoolClass.isActive) throw new Error("Selected class is not active");
  if (req.user?.branchId != null && Number(schoolClass.branchId) !== Number(req.user.branchId)) throw new Error("Selected class does not belong to your branch");
  const classSubject = await ClassSubject.findOne({ where: { classId, subjectId } });
  if (!classSubject) throw new Error("Subject is not assigned to the selected class");
  body.examId = Number(examId);
  body.classId = Number(classId);
  body.sectionId = sectionId ? Number(sectionId) : null;
  body.subjectId = Number(subjectId);
  body.date = new Date(date);
  body.branchId = req.user?.branchId;
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

const validateClassSubject = async (body: any, req: Request) => {
  const existing = await getExisting(ClassSubject, req);
  const classId = Number(body.classId ?? existing?.classId);
  const subjectId = Number(body.subjectId ?? existing?.subjectId);
  const branchId = req.user?.branchId;
  if (!Number.isInteger(classId) || classId <= 0 || !Number.isInteger(subjectId) || subjectId <= 0) throw new Error("classId and subjectId are required");
  const schoolClass = await SchoolClass.findByPk(classId);
  if (!schoolClass || !schoolClass.isActive) throw new Error("Class not found or inactive");
  if (branchId != null && Number(schoolClass.branchId) !== Number(branchId)) throw new Error("Class does not belong to your branch");
  const subject = await Subject.findByPk(subjectId);
  if (!subject || !subject.isActive) throw new Error("Subject not found or inactive");
  const duplicate = await ClassSubject.findOne({ where: { classId, subjectId, ...(existing?.id ? { id: { [Op.ne]: existing.id } } : {}) } });
  if (duplicate) throw new Error("Subject is already assigned to this class");
  body.classId = classId; body.subjectId = subjectId; body.branchId = branchId;
  return body;
};

const validateAssignment = async (body: any, req: Request) => {
  const existing = await getExisting(Assignment, req);
  const title = String(body.title ?? existing?.title ?? "").trim();
  const classId = Number(body.classId ?? existing?.classId);
  const subjectId = Number(body.subjectId ?? existing?.subjectId);
  const maxMarks = Number(body.maxMarks ?? existing?.maxMarks);
  const dueDate = body.dueDate !== undefined ? new Date(body.dueDate) : (existing?.dueDate ? new Date(existing.dueDate) : null);
  const branchId = req.user?.branchId;
  if (!title || !Number.isInteger(classId) || classId <= 0 || !Number.isInteger(subjectId) || subjectId <= 0) throw new Error("title, classId and subjectId are required");
  if (!Number.isInteger(maxMarks) || maxMarks <= 0) throw new Error("maxMarks must be a positive integer");
  if (dueDate && !Number.isFinite(dueDate.getTime())) throw new Error("Invalid dueDate");
  const schoolClass = await SchoolClass.findByPk(classId);
  if (!schoolClass || !schoolClass.isActive) throw new Error("Class not found or inactive");
  if (branchId != null && Number(schoolClass.branchId) !== Number(branchId)) throw new Error("Class does not belong to your branch");
  const subject = await Subject.findByPk(subjectId);
  if (!subject || !subject.isActive) throw new Error("Subject not found or inactive");
  if (!(await ClassSubject.findOne({ where: { classId, subjectId } }))) throw new Error("Subject is not assigned to the selected class");
  const teacherId = body.createdBy ?? existing?.createdBy;
  if (teacherId) {
    const teacher = await Teacher.findByPk(teacherId, { include: [{ model: User }] });
    if (!teacher || !teacher.isActive || (branchId != null && Number(teacher.user?.branchId) !== Number(branchId))) throw new Error("Assignment teacher does not belong to your branch");
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
  const branchId = req.user?.branchId;
  if (!Number.isInteger(assignmentId) || assignmentId <= 0 || !Number.isInteger(studentId) || studentId <= 0) throw new Error("assignmentId and studentId are required");
  const assignment = await Assignment.findByPk(assignmentId);
  if (!assignment) throw new Error("Assignment not found");
  if (branchId != null && Number(assignment.branchId) !== Number(branchId)) throw new Error("Assignment does not belong to your branch");
  const student = await Student.findByPk(studentId);
  if (!student) throw new Error("Student not found");
  if (branchId != null && Number(student.branchId) !== Number(branchId)) throw new Error("Student does not belong to your branch");
  const enrolment = await Enrolment.findOne({ where: { studentId, classId: assignment.classId, ...(branchId != null ? { branchId } : {}), status: { [Op.notIn]: ["withdrawn", "expelled"] } } });
  if (!enrolment) throw new Error("Student is not enrolled in the assignment class");
  if (marks != null && (!Number.isFinite(marks) || marks < 0 || marks > Number(assignment.maxMarks))) throw new Error("marksAwarded must be between 0 and assignment maxMarks");
  if (submittedAt && !Number.isFinite(submittedAt.getTime())) throw new Error("Invalid submittedAt");
  const status = String(body.status ?? existing?.status ?? "submitted");
  if (!["submitted","graded","returned","late"].includes(status)) throw new Error("Invalid submission status");
  const duplicate = await Submission.findOne({ where: { assignmentId, studentId, ...(existing?.id ? { id: { [Op.ne]: existing.id } } : {}) } });
  if (duplicate) throw new Error("Submission already exists for this assignment and student");
  body.assignmentId = assignmentId; body.studentId = studentId; body.marksAwarded = marks; body.submittedAt = submittedAt; body.status = status; body.branchId = branchId;
  return body;
};

const validateGradebook = async (body: any, req: Request) => {
  const existing = await getExisting(GradebookEntry, req);
  const studentId = Number(body.studentId ?? existing?.studentId);
  const termId = Number(body.termId ?? existing?.termId);
  const subjectId = Number(body.subjectId ?? existing?.subjectId);
  const branchId = req.user?.branchId;
  if (!Number.isInteger(studentId) || studentId <= 0 || !Number.isInteger(termId) || termId <= 0 || !Number.isInteger(subjectId) || subjectId <= 0) throw new Error("studentId, termId and subjectId are required");
  const student = await Student.findByPk(studentId);
  if (!student) throw new Error("Student not found");
  if (branchId != null && Number(student.branchId) !== Number(branchId)) throw new Error("Student does not belong to your branch");
  const term = await Term.findByPk(termId);
  if (!term) throw new Error("Term not found");
  const enrolment = await Enrolment.findOne({ where: { studentId, academicYearId: term.academicYearId, ...(branchId != null ? { branchId } : {}), status: { [Op.notIn]: ["withdrawn","expelled"] } } });
  if (!enrolment) throw new Error("Student is not enrolled in the term academic year");
  if (!(await ClassSubject.findOne({ where: { classId: enrolment.classId, subjectId } }))) throw new Error("Subject is not assigned to the student's class");
  for (const key of ["continuousAvg","examScore","total"]) {
    if (body[key] !== undefined && body[key] !== null && (!Number.isFinite(Number(body[key])) || Number(body[key]) < 0 || Number(body[key]) > 100)) throw new Error(key + " must be between 0 and 100");
  }
  const duplicate = await GradebookEntry.findOne({ where: { studentId, termId, subjectId, ...(existing?.id ? { id: { [Op.ne]: existing.id } } : {}) } });
  if (duplicate) throw new Error("Gradebook entry already exists for this student, term and subject");
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
  const branchId=req.user?.branchId;
  if(!name || !Number.isInteger(classId) || classId<=0) throw new Error("name and classId are required");
  if(validFrom && !Number.isFinite(validFrom.getTime()) || validTo && !Number.isFinite(validTo.getTime())) throw new Error("Invalid timetable dates");
  if(validFrom && validTo && validFrom>validTo) throw new Error("validFrom must be before validTo");
  const schoolClass=await SchoolClass.findByPk(classId);
  if(!schoolClass || !schoolClass.isActive) throw new Error("Class not found or inactive");
  if(branchId!=null && Number(schoolClass.branchId)!==Number(branchId)) throw new Error("Class does not belong to your branch");
  if(sectionId){ const section=await Section.findByPk(sectionId); if(!section || !section.isActive || Number(section.classId)!==classId) throw new Error("Selected section does not belong to the selected class"); }
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
  const parse=(v:any)=>{const m=/^(\\d{1,2}):(\\d{2})$/.exec(String(v??"").trim()); if(!m)return null; const h=Number(m[1]),mi=Number(m[2]); return h>=0&&h<=23&&mi>=0&&mi<=59?h*60+mi:null;};
  const branchId=req.user?.branchId;
  if(!Number.isInteger(classId)||classId<=0) throw new Error("classId is required");
  if(!["MON","TUE","WED","THU","FRI","SAT","SUN"].includes(day)) throw new Error("Invalid dayOfWeek");
  const sm=parse(start), em=parse(end); if(sm===null||em===null||sm>=em) throw new Error("Invalid period time range");
  const schoolClass=await SchoolClass.findByPk(classId); if(!schoolClass||!schoolClass.isActive) throw new Error("Class not found or inactive");
  if(branchId!=null&&Number(schoolClass.branchId)!==Number(branchId)) throw new Error("Class does not belong to your branch");
  if(sectionId){const section=await Section.findByPk(sectionId); if(!section||!section.isActive||Number(section.classId)!==classId) throw new Error("Selected section does not belong to the selected class");}
  if(subjectId){const subject=await Subject.findByPk(subjectId); if(!subject||!subject.isActive||!(await ClassSubject.findOne({where:{classId,subjectId}}))) throw new Error("Subject is not assigned to the selected class");}
  if(teacherId){const teacher=await Teacher.findByPk(teacherId,{include:[{model:User}]}); if(!teacher||!teacher.isActive||(branchId!=null&&Number(teacher.user?.branchId)!==Number(branchId))) throw new Error("Teacher does not belong to your branch");}
  body.classId=classId; body.sectionId=sectionId; body.subjectId=subjectId; body.teacherId=teacherId; body.dayOfWeek=day; body.startTime=String(start); body.endTime=String(end); body.branchId=branchId; return body;
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

export const RESOURCES: ResourceDefinition[] = [
  { path: "roles", model: Role, searchable: ["name", "label", "description"], permission: "roles" },
  { path: "permissions", model: Permission, searchable: ["key", "label", "category"], permission: "permissions" },
  { path: "branches", model: Branch, searchable: ["name", "code", "city", "email"], permission: "branches" },
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
  { path: "classes", model: SchoolClass, searchable: ["name", "level"], permission: "classes" },
  { path: "sections", model: Section, searchable: ["name"], permission: "sections" },
  { path: "subjects", model: Subject, searchable: ["name", "code"], permission: "subjects" },
  { path: "class-subjects", model: ClassSubject, searchable: [], permission: "subjects", beforeCreate: validateClassSubject, beforeUpdate: validateClassSubject },
  {
    path: "enrolments", model: Enrolment, searchable: ["rollNo", "status"], permission: "students",
    beforeCreate: validateEnrolment,
    beforeUpdate: validateEnrolment,
  },
  { path: "parents", model: Parent, searchable: ["fullName", "phone", "email"], permission: "students" },
  { path: "teachers", model: Teacher, searchable: ["staffNo", "firstName", "lastName", "email"], permission: "teachers" },
  { path: "staff", model: Staff, searchable: ["staffNo", "firstName", "lastName", "department"], permission: "staff" },
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
  { path: "grade-scales", model: GradeScale, searchable: ["name", "grade"], permission: "gradebook" },
  { path: "timetable", model: Timetable, searchable: ["name"], permission: "timetable", beforeCreate: validateTimetable, beforeUpdate: validateTimetable },
  { path: "periods", model: Period, searchable: ["dayOfWeek", "room"], permission: "timetable", beforeCreate: validatePeriod, beforeUpdate: validatePeriod },
  { path: "fee-types", model: FeeType, searchable: ["name", "category"], permission: "fees" },
  { path: "expenses", model: Expense, searchable: ["title", "category", "status"], permission: "expenses" },
  {
    path: "payroll", model: PayrollItem, searchable: ["month", "status"], permission: "payroll",
    beforeCreate: async (body, req) => {
      const month = String(body.month ?? "").trim();
      if (!/^\\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("month must be in YYYY-MM format");
      const payeeType = body.payeeType === "staff" ? "staff" : body.payeeType === "teacher" ? "teacher" : null;
      if (!payeeType) throw new Error("payeeType must be teacher or staff");
      const teacherId = body.teacherId ? Number(body.teacherId) : null;
      const staffId = body.staffId ? Number(body.staffId) : null;
      if ((payeeType === "teacher" && (!teacherId || staffId)) || (payeeType === "staff" && (!staffId || teacherId))) {
        throw new Error("Payroll must reference exactly one matching teacher or staff member");
      }
      const payee = payeeType === "teacher"
        ? await Teacher.findByPk(teacherId as number, { include: [{ model: User, where: req.user?.branchId != null ? { branchId: req.user.branchId } : undefined, required: req.user?.branchId != null }] })
        : await Staff.findByPk(staffId as number, { include: [{ model: User, where: req.user?.branchId != null ? { branchId: req.user.branchId } : undefined, required: req.user?.branchId != null }] });
      if (!payee || !payee.isActive) throw new Error("Selected payroll payee is not active or does not belong to your branch");
      const duplicateWhere = payeeType === "teacher" ? { month, teacherId } : { month, staffId };
      const duplicate = await PayrollItem.findOne({ where: duplicateWhere });
      if (duplicate) throw new Error("Payroll already exists for this payee and month");
      const basicSalary = Number(body.basicSalary);
      const allowances = Number(body.allowances ?? 0);
      const deductions = Number(body.deductions ?? 0);
      if (!Number.isFinite(basicSalary) || basicSalary < 0 || !Number.isFinite(allowances) || allowances < 0 || !Number.isFinite(deductions) || deductions < 0) {
        throw new Error("Salary amounts must be valid non-negative numbers");
      }
      if (body.status === "paid" && !body.paidOn) throw new Error("paidOn is required when payroll status is paid");
      body.netPay = basicSalary + allowances - deductions;
      return body;
    },
    beforeUpdate: async (body, req) => {
      const id = Number(req.params.id);
      const current = await PayrollItem.findByPk(id);
      if (!current) throw new Error("Payroll item not found");
      const month = String(body.month ?? current.month ?? "").trim();
      if (!/^\\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("month must be in YYYY-MM format");
      const payeeType = body.payeeType ?? current.payeeType;
      if (payeeType !== "teacher" && payeeType !== "staff") throw new Error("payeeType must be teacher or staff");
      const teacherId = body.teacherId !== undefined ? (body.teacherId ? Number(body.teacherId) : null) : (current.teacherId ?? null);
      const staffId = body.staffId !== undefined ? (body.staffId ? Number(body.staffId) : null) : (current.staffId ?? null);
      if ((payeeType === "teacher" && (!teacherId || staffId)) || (payeeType === "staff" && (!staffId || teacherId))) {
        throw new Error("Payroll must reference exactly one matching teacher or staff member");
      }
      const payee = payeeType === "teacher"
        ? await Teacher.findByPk(teacherId as number, { include: [{ model: User, where: req.user?.branchId != null ? { branchId: req.user.branchId } : undefined, required: req.user?.branchId != null }] })
        : await Staff.findByPk(staffId as number, { include: [{ model: User, where: req.user?.branchId != null ? { branchId: req.user.branchId } : undefined, required: req.user?.branchId != null }] });
      if (!payee || !payee.isActive) throw new Error("Selected payroll payee is not active or does not belong to your branch");
      const duplicateWhere = payeeType === "teacher" ? { month, teacherId, id: { [Op.ne]: id } } : { month, staffId, id: { [Op.ne]: id } };
      const duplicate = await PayrollItem.findOne({ where: duplicateWhere });
      if (duplicate) throw new Error("Payroll already exists for this payee and month");
      const basicSalary = Number(body.basicSalary ?? current.basicSalary);
      const allowances = Number(body.allowances ?? current.allowances ?? 0);
      const deductions = Number(body.deductions ?? current.deductions ?? 0);
      if (!Number.isFinite(basicSalary) || basicSalary < 0 || !Number.isFinite(allowances) || allowances < 0 || !Number.isFinite(deductions) || deductions < 0) {
        throw new Error("Salary amounts must be valid non-negative numbers");
      }
      const status = body.status ?? current.status;
      if (status === "paid" && !(body.paidOn ?? current.paidOn)) throw new Error("paidOn is required when payroll status is paid");
      body.month = month;
      body.payeeType = payeeType;
      body.teacherId = payeeType === "teacher" ? teacherId : null;
      body.staffId = payeeType === "staff" ? staffId : null;
      body.netPay = basicSalary + allowances - deductions;
      return body;
    },
  },
  {
    path: "payslips", model: Payslip, searchable: ["payslipNo"], permission: "payroll",
    beforeCreate: async (body) => {
      if ((body.gross === undefined || body.gross === null || body.gross === "") && body.payrollItemId) {
        const item = await PayrollItem.findByPk(body.payrollItemId);
        if (item) {
          body.gross = Number(item.basicSalary) + Number(item.allowances ?? 0);
          body.net = Number(item.netPay ?? body.gross);
        }
      }
      if (body.gross === undefined || body.gross === null || body.gross === "") body.gross = 0;
      if (body.net === undefined || body.net === null || body.net === "") body.net = body.gross;
      return body;
    },
  },
  {
    path: "leaves", model: LeaveRequest, searchable: ["leaveType", "status"], permission: "leaves",
    beforeCreate: (body, req) => {
      body.userId = req.user?.id;
      return body;
    },
    beforeUpdate: (body) => {
      delete body.userId;
      return body;
    },
  },
  { path: "books", model: Book, searchable: ["title", "author", "isbn", "category"], permission: "library" },
  { path: "book-copies", model: BookCopy, searchable: ["accessionNo", "status"], permission: "library" },
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
  { path: "hostels", model: Hostel, searchable: ["name", "wardenName"], permission: "hostels" },
  {
    path: "rooms", model: Room, searchable: ["roomNo", "floor"], permission: "rooms",
    includes: [{ association: "hostel", attributes: ["id", "name"] }],
    decorate: (row) => {
      const p = plain(row);
      p.hostelName = p.hostel?.name ?? "";
      return p;
    },
  },
  {
    path: "beds", model: Bed, searchable: ["bedNo"], permission: "beds",
    includes: [{ association: "room", attributes: ["id", "roomNo"] }],
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
    // Only a student + bed are needed; room and hostel come from the bed.
    beforeCreate: async (body) => {
      if (!body.bedId) throw new Error("bedId is required");
      const bed = await Bed.findByPk(body.bedId);
      if (!bed) throw new Error("Selected bed not found");
      if (bed.status !== "available") throw new Error("Selected bed is not available");
      const active = await HostelAllocation.findOne({ where: { bedId: bed.id, status: "active" } });
      if (active) throw new Error("Selected bed is already allocated");
      const studentActive = await HostelAllocation.findOne({ where: { studentId: body.studentId, status: "active" } });
      if (studentActive) throw new Error("Student already has an active hostel allocation");
      body.roomId = bed.roomId;
      const room = await Room.findByPk(bed.roomId);
      if (!room) throw new Error("Selected room not found");
      body.hostelId = room.hostelId;
      return body;
    },
    beforeUpdate: async (body) => {
      if (body.bedId) {
        const bed = await Bed.findByPk(body.bedId);
        if (!bed) throw new Error("Selected bed not found");
        if (bed.status !== "available") throw new Error("Selected bed is not available");
        body.roomId = bed.roomId;
        const room = await Room.findByPk(bed.roomId);
        if (!room) throw new Error("Selected room not found");
        body.hostelId = room.hostelId;
      }
      return body;
    },
  },
  { path: "events", model: Event, searchable: ["title", "category", "venue"], permission: "events" },
  { path: "notices", model: Notice, searchable: ["title", "type"], permission: "notices" },
  { path: "announcements", model: Announcement, searchable: ["title", "priority"], permission: "announcements" },
  {
    path: "messages", model: Message, searchable: ["subject"], permission: "messages",
    beforeCreate: (body, req) => {
      body.senderId = req.user?.id;
      return body;
    },
    beforeUpdate: (body) => {
      delete body.senderId;
      return body;
    },
  },
  { path: "notifications", model: Notification, searchable: ["title"], permission: "notifications", readonly: true },
  { path: "syllabus", model: Syllabus, searchable: ["title"], permission: "syllabus" },
  { path: "lesson-plans", model: LessonPlan, searchable: ["title"], permission: "lesson-plans" },
  { path: "health-records", model: HealthRecord, searchable: ["bloodGroup"], permission: "health-records", readonly: true },
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