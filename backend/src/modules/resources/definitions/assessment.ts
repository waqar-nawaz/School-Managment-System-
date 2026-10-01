/** Exams, results, assignments, gradebook, timetable and teaching plans */
import { Request } from "express";
import { ApiError } from "../../../utils/ApiError";
import { Op } from "sequelize";
import {
  AcademicYear,
  Term,
  SchoolClass,
  Section,
  Subject,
  Student,
  ClassSubject,
  Enrolment,
  Teacher,
  Exam,
  ExamSchedule,
  ExamResult,
  ReportCard,
  Assignment,
  Submission,
  GradebookEntry,
  GradeScale,
  Timetable,
  Period,
  Syllabus,
  LessonPlan,
  User,
} from "../../../models";
import { ResourceDefinition, getExisting } from "./shared";

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
  // NOTE: literal \d (not escaped \\d) — earlier double-escaped regex matched a literal backslash+d, not a digit.
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
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
  if (!name || !Number.isInteger(academicYearId) || academicYearId <= 0) throw ApiError.badRequest('name and academicYearId are required');
  if (!['weekly','monthly','midterm','final','quiz'].includes(type)) throw ApiError.badRequest('Invalid exam type');
  if (!['draft','published','completed','cancelled'].includes(status)) throw ApiError.badRequest('Invalid exam status');
  if (!start || !end || !Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start > end) throw ApiError.badRequest('Invalid exam date range');
  if (!Number.isInteger(maxMarks) || maxMarks <= 0) throw ApiError.badRequest('maxMarks must be a positive integer');
  const year = await AcademicYear.findByPk(academicYearId);
  if (!year) throw ApiError.badRequest('Academic year not found');
  if (start < new Date(year.startDate) || end > new Date(year.endDate)) throw ApiError.badRequest('Exam dates must be within the academic year');
  if (termId) { const term = await Term.findByPk(termId); if (!term || Number(term.academicYearId) !== academicYearId) throw ApiError.badRequest('Selected term does not belong to the academic year'); }
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
  if (!Number.isInteger(enrolmentId) || enrolmentId <= 0) throw ApiError.badRequest('enrolmentId is required');
  const enrolment = await Enrolment.findByPk(enrolmentId);
  if (!enrolment) throw ApiError.badRequest('Enrolment not found');
  if (req.user?.branchId != null && Number(enrolment.branchId) !== Number(req.user.branchId)) throw ApiError.badRequest('Enrolment does not belong to your branch');
  if (termId) { const term = await Term.findByPk(termId); if (!term || Number(term.academicYearId) !== Number(enrolment.academicYearId)) throw ApiError.badRequest('Term does not belong to the enrolment academic year'); }
  if (existing && Number(existing.enrolmentId) !== enrolmentId) throw ApiError.badRequest('Report card enrolment cannot be changed');
  const duplicate = await ReportCard.findOne({ where: { enrolmentId, termId, ...(existing?.id ? { id: { [Op.ne]: existing.id } } : {}) } });
  if (duplicate) throw ApiError.badRequest('Report card already exists for this enrolment and term');
  body.enrolmentId=enrolmentId; body.studentId=enrolment.studentId; body.termId=termId; body.branchId=req.user?.branchId;
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

export const ASSESSMENT_RESOURCES: ResourceDefinition[] = [
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
  { path: "syllabus", model: Syllabus, searchable: ["title"], permission: "syllabus", beforeCreate: (body, req) => validateTeachingPlan(body, req), beforeUpdate: (body, req) => validateTeachingPlan(body, req) },
  { path: "lesson-plans", model: LessonPlan, searchable: ["title"], permission: "lesson-plans", beforeCreate: (body, req) => validateTeachingPlan({ ...body, __lessonPlan: true }, req), beforeUpdate: (body, req) => validateTeachingPlan({ ...body, __lessonPlan: true }, req) },
];
