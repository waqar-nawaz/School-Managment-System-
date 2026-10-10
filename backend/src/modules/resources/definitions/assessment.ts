/** Exams, results, assignments, gradebook, timetable and teaching plans */
import { Request } from "express";
import { ApiError } from "../../../utils/ApiError";
import { Op } from "sequelize";
import { studentScope, ownStudentIds } from "../../../utils/access";
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

const dayKey = (d: Date | string) => new Date(d).toISOString().slice(0, 10);
const pad = (mins: number) => `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Letter grade for a percentage from the branch grade scale (null when no scale matches). */
const gradeFor = async (branchId: number, pct: number): Promise<string | null> => {
  const scales = await GradeScale.findAll({ where: { branchId }, order: [["minPercentage", "DESC"]] });
  const p = round2(pct);
  return scales.find((g) => p >= Number(g.minPercentage) && p <= Number(g.maxPercentage))?.grade ?? null;
};

const teacherOfUser = async (req: Request) => (req.user?.role === "teacher" ? Teacher.findOne({ where: { userId: req.user.id } }) : null);

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
  body.grade = await gradeFor(branchId, (obtained / max) * 100);
  if (!existing) body.enteredBy = req.user?.id; else delete body.enteredBy;
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
  if (exam.startDate && dayKey(date) < dayKey(exam.startDate)) throw ApiError.badRequest("Exam schedule date is before the exam start date");
  if (exam.endDate && dayKey(date) > dayKey(exam.endDate)) throw ApiError.badRequest("Exam schedule date is after the exam end date");

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

  const others = await ExamSchedule.findAll({
    where: { examId, classId, branchId, ...(existing?.id ? { id: { [Op.ne]: existing.id } } : {}) },
  });
  for (const o of others) {
    if (dayKey(o.date) !== dayKey(date)) continue;
    const sameScope = o.sectionId == null || sectionId == null || Number(o.sectionId) === Number(sectionId);
    if (!sameScope) continue;
    if (Number(o.subjectId) === subjectId) throw ApiError.badRequest("This subject is already scheduled for the selected class on this date");
    const os = parseTimeMinutes(o.startTime), oe = parseTimeMinutes(o.endTime);
    if (os !== null && oe !== null && start < oe && end > os) {
      throw ApiError.badRequest("Another paper for this class overlaps this time slot");
    }
  }

  body.examId = examId; body.classId = classId; body.sectionId = sectionId;
  body.subjectId = subjectId; body.date = date; body.branchId = branchId;
  body.startTime = pad(start); body.endTime = pad(end);
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
  if (name.length > 120) throw ApiError.badRequest('Exam name must be 120 characters or fewer');
  if (!['weekly','monthly','midterm','final','quiz'].includes(type)) throw ApiError.badRequest('Invalid exam type');
  if (!['draft','published','completed','cancelled'].includes(status)) throw ApiError.badRequest('Invalid exam status');
  if (!start || !end || !Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start > end) throw ApiError.badRequest('Invalid exam date range');
  if (!Number.isInteger(maxMarks) || maxMarks <= 0) throw ApiError.badRequest('maxMarks must be a positive integer');
  const year = await AcademicYear.findOne({ where: { id: academicYearId, branchId: Number(req.user?.branchId) } });
  if (!year) throw ApiError.badRequest('Academic year not found or outside your branch');
  if (dayKey(start) < dayKey(year.startDate) || dayKey(end) > dayKey(year.endDate)) throw ApiError.badRequest('Exam dates must be within the academic year');
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
  if (title.length > 160) throw ApiError.badRequest("Assignment title must be 160 characters or fewer");
  if (!Number.isInteger(maxMarks) || maxMarks <= 0) throw ApiError.badRequest("maxMarks must be a positive integer");
  if (dueDate && !Number.isFinite(dueDate.getTime())) throw ApiError.badRequest("Invalid dueDate");
  const schoolClass = await SchoolClass.findOne({ where: { id: classId, branchId } });
  if (!schoolClass || !schoolClass.isActive) throw ApiError.badRequest("Class not found, inactive, or outside your branch");
  const subject = await Subject.findOne({ where: { id: subjectId, branchId } });
  if (!subject || !subject.isActive) throw ApiError.badRequest("Subject not found, inactive, or outside your branch");
  if (!(await ClassSubject.findOne({ where: { classId, subjectId, branchId } }))) throw ApiError.badRequest("Subject is not assigned to the selected class");
  const ownTeacher = await teacherOfUser(req);
  // A teacher always owns what they create; only admins may pick another author.
  const teacherId = ownTeacher ? (existing?.createdBy ?? ownTeacher.id) : (body.createdBy ?? existing?.createdBy);
  if (teacherId) {
    const teacher = await Teacher.findOne({ where: { id: Number(teacherId), branchId }, include: [{ model: User }] });
    if (!teacher || !teacher.isActive || Number(teacher.user?.branchId) !== branchId) throw ApiError.badRequest("Assignment teacher does not belong to your branch");
  }
  body.title = title; body.classId = classId; body.subjectId = subjectId; body.maxMarks = maxMarks; body.dueDate = dueDate; body.branchId = branchId;
  body.createdBy = teacherId ? Number(teacherId) : null;
  return body;
};

const validateSubmission = async (body: any, req: Request) => {
  const existing = await getExisting(Submission, req);
  const assignmentId = Number(body.assignmentId ?? existing?.assignmentId);
  let studentIdRaw = body.studentId ?? existing?.studentId;
  if (req.user?.role === "student") {
    const own = await ownStudentIds(req);
    const mine = own?.[0];
    if (!mine) throw ApiError.forbidden("No student record is linked to your account");
    if (body.studentId !== undefined && Number(body.studentId) !== mine) throw ApiError.forbidden("You can only submit your own work");
    studentIdRaw = mine;
    // Students cannot grade themselves.
    delete body.marksAwarded; delete body.feedback; delete body.status;
  }
  const studentId = Number(studentIdRaw);
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
  let status = String(body.status ?? existing?.status ?? "submitted");
  if (!["submitted","graded","returned","late"].includes(status)) throw ApiError.badRequest("Invalid submission status");
  const when = submittedAt ?? (existing ? null : new Date());
  if (!existing) body.submittedAt = when;
  if (marks != null && body.marksAwarded !== undefined && ["submitted", "late"].includes(status)) status = "graded";
  else if (!existing && body.status === undefined && assignment.dueDate && when && dayKey(when) > dayKey(assignment.dueDate)) status = "late";
  const duplicate = await Submission.findOne({ where: { assignmentId, studentId, branchId, ...(existing?.id ? { id: { [Op.ne]: existing.id } } : {}) } });
  if (duplicate) throw ApiError.badRequest("Submission already exists for this assignment and student");
  body.assignmentId = assignmentId; body.studentId = studentId; body.marksAwarded = marks; body.submittedAt = body.submittedAt ?? submittedAt; body.status = status; body.branchId = branchId;
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
  const num = (v: any) => (v === undefined || v === null || v === "" ? null : Number(v));
  const ca = body.continuousAvg !== undefined ? num(body.continuousAvg) : num(existing?.continuousAvg);
  const ex = body.examScore !== undefined ? num(body.examScore) : num(existing?.examScore);
  let total = body.total !== undefined ? num(body.total) : num(existing?.total);
  // total = plain average of the parts that exist, unless someone typed a total explicitly.
  if (body.total === undefined && (body.continuousAvg !== undefined || body.examScore !== undefined)) {
    const parts = [ca, ex].filter((v): v is number => v !== null);
    total = parts.length ? round2(parts.reduce((a, b) => a + b, 0) / parts.length) : null;
  }
  body.total = total;
  body.grade = total === null ? null : await gradeFor(branchId, total);
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
  const others = await Period.findAll({ where: { branchId, dayOfWeek: day, ...(existing?.id ? { id: { [Op.ne]: existing.id } } : {}) } });
  for (const o of others) {
    const os = parse(o.startTime), oe = parse(o.endTime);
    if (os === null || oe === null || !(sm < oe && em > os)) continue;
    const sameClass = Number(o.classId) === classId && (o.sectionId == null || sectionId == null || Number(o.sectionId) === Number(sectionId));
    if (sameClass) throw ApiError.badRequest("This time overlaps another period of the same class/section");
    if (teacherId && o.teacherId != null && Number(o.teacherId) === teacherId) throw ApiError.badRequest("Teacher already has a period at this time");
  }
  body.classId=classId; body.sectionId=sectionId; body.subjectId=subjectId; body.teacherId=teacherId; body.dayOfWeek=day; body.startTime=pad(sm); body.endTime=pad(em); body.branchId=branchId; return body;
};

/** Rebuild every timetable's weeklyGrid from its periods (class + section). */
const rebuildGrids = async (branchId: number | null | undefined) => {
  const tables = await Timetable.findAll({ where: branchId != null ? { branchId } : {} });
  for (const t of tables) {
    const periods = await Period.findAll({
      where: { classId: t.classId, branchId: t.branchId, ...(t.sectionId ? { sectionId: { [Op.or]: [t.sectionId, null] } } : {}) },
      order: [["startTime", "ASC"]],
    });
    const grid: Record<string, unknown[]> = {};
    for (const p of periods) {
      (grid[p.dayOfWeek] ??= []).push({ id: Number(p.id), startTime: p.startTime, endTime: p.endTime, subjectId: p.subjectId ?? null, teacherId: p.teacherId ?? null, room: p.room ?? null });
    }
    await t.update({ weeklyGrid: grid });
  }
  };
const refreshGrids = async (_row: any, req: Request) => rebuildGrids(req.user?.branchId);

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
  Object.assign(body, await computeReportCard(enrolment, termId));
  // Remarks / publish flag are the only hand-edited fields; totals always come from the results.
  return body;
};

/** Totals, grade and per-subject breakdown from the student's exam results for the term (or whole year). */
const computeReportCard = async (enrolment: any, termId: number | null) => {
  const exams = await Exam.findAll({
    where: { academicYearId: enrolment.academicYearId, branchId: enrolment.branchId, status: { [Op.ne]: "cancelled" }, ...(termId ? { termId } : {}) },
    attributes: ["id"],
  });
  const results = exams.length
    ? await ExamResult.findAll({ where: { studentId: enrolment.studentId, examId: exams.map((e) => e.id) }, include: [{ model: Subject, attributes: ["id", "name"] }] })
    : [];
  const bySubject = new Map<number, { subjectId: number; subject: string; obtained: number; max: number }>();
  for (const r of results as any[]) {
    const cur = bySubject.get(Number(r.subjectId)) ?? { subjectId: Number(r.subjectId), subject: r.subject?.name ?? r.Subject?.name ?? String(r.subjectId), obtained: 0, max: 0 };
    cur.obtained += Number(r.marksObtained ?? 0); cur.max += Number(r.maxMarks ?? 0);
    bySubject.set(Number(r.subjectId), cur);
  }
  const rows = [...bySubject.values()];
  const obtained = rows.reduce((a, r) => a + r.obtained, 0);
  const total = rows.reduce((a, r) => a + r.max, 0);
  const percentage = total > 0 ? round2((obtained / total) * 100) : 0;
  const subjectWise = [];
  for (const r of rows) subjectWise.push({ ...r, percentage: r.max ? round2((r.obtained / r.max) * 100) : 0, grade: r.max ? await gradeFor(Number(enrolment.branchId), (r.obtained / r.max) * 100) : null });
  return {
    subjectWise, obtainedMarks: round2(obtained), totalMarks: round2(total), percentage,
    grade: total > 0 ? await gradeFor(Number(enrolment.branchId), percentage) : null,
  };
};

/** Dense rank by percentage among report cards of the same class, year and term. */
const rerankClass = async (card: any) => {
  const enrolment = await Enrolment.findByPk(card.enrolmentId);
  if (!enrolment) return;
  const mates = await Enrolment.findAll({ where: { classId: enrolment.classId, academicYearId: enrolment.academicYearId, branchId: enrolment.branchId }, attributes: ["id"] });
  const cards = await ReportCard.findAll({ where: { enrolmentId: mates.map((m) => m.id), termId: card.termId ?? null } });
  cards.sort((a, b) => Number(b.percentage ?? 0) - Number(a.percentage ?? 0));
  let rank = 0, prev: number | null = null;
  for (const [i, c] of cards.entries()) {
    const pct = Number(c.percentage ?? 0);
    if (prev === null || pct < prev) rank = i + 1;
    prev = pct;
    if (Number(c.rankInClass) !== rank) await c.update({ rankInClass: rank });
  }
  await card.reload();
};

const validateTeachingPlan = async (body: any, req: Request, isLessonPlan: boolean) => {
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

  const ownTeacher = await teacherOfUser(req);
  if (isLessonPlan && ownTeacher) {
    body.teacherId = Number(existing?.teacherId ?? ownTeacher.id);
  } else if (isLessonPlan && body.teacherId !== undefined && body.teacherId !== null && body.teacherId !== "") {
    const teacherId = Number(body.teacherId);
    if (!Number.isInteger(teacherId) || teacherId <= 0) throw ApiError.badRequest("Invalid teacherId");
    const teacher = await Teacher.findOne({ where: { id: teacherId, branchId } });
    if (!teacher || !teacher.isActive) throw ApiError.badRequest("Teacher not found, inactive, or outside your branch");
    body.teacherId = teacherId;
  }

  // `teacherId` only exists on lesson plans; `__lessonPlan` from a client is just noise.
  delete body.__lessonPlan;
  if (!isLessonPlan) delete body.teacherId;
  body.title = title;
  body.classId = classId;
  body.subjectId = subjectId;
  if (dateRaw !== undefined) body[dateField] = plannedDate;
  else if (!isLessonPlan && !existing) body.publishedAt = new Date();
  body.branchId = branchId;
  return body;
};

/** Ids from the URL for delete guards. */
const rid = (req: Request) => Number(req.params.id);
const inUse = (what: string, by: string) => ApiError.badRequest(`This ${what} is in use (${by}) and cannot be deleted`);

const familyReportScope = async (req: Request) => {
  const own = await studentScope(req);
  return Object.keys(own).length ? { ...own, isPublished: true } : {};
};

/** Parents/students only see assignments of their own classes (and only published ones). */
const assignmentScope = async (req: Request) => {
  const own = await ownStudentIds(req);
  if (own === null) return {};
  const rows = await Enrolment.findAll({ where: { studentId: own, status: { [Op.notIn]: ["withdrawn", "expelled"] } }, attributes: ["classId"] });
  return { classId: [...new Set(rows.map((r) => Number(r.classId)))], isPublished: true };
};

export const ASSESSMENT_RESOURCES: ResourceDefinition[] = [
  {
    path: "exams", model: Exam, searchable: ["name", "examType", "status"], permission: "exams", beforeCreate: validateExam, beforeUpdate: validateExam,
    beforeRemove: async (req) => {
      const id = rid(req);
      if ((await ExamResult.count({ where: { examId: id } })) || (await ExamSchedule.count({ where: { examId: id } }))) throw inUse("exam", "it has results or a schedule");
    },
  },
  {
    path: "exam-schedules", model: ExamSchedule, searchable: ["room", "startTime"], permission: "exams",
    beforeCreate: validateExamSchedule,
    beforeUpdate: validateExamSchedule,
  },
  {
    path: "exam-results", model: ExamResult, searchable: ["grade", "remarks"], permission: "exam-results",
    scopeWhere: (req) => studentScope(req),
    beforeCreate: validateExamResult,
    beforeUpdate: validateExamResult,
  },
  {
    path: "report-cards", model: ReportCard, searchable: ["grade"], permission: "exam-results",
    scopeWhere: familyReportScope,
    // studentId is required by the model but not on the form — derive it from the enrolment.
    beforeCreate: validateReportCard,
    beforeUpdate: validateReportCard,
    afterCreate: (row) => rerankClass(row),
    afterUpdate: (row) => rerankClass(row),
    afterRemove: (row) => rerankClass(row),
  },
  {
    path: "assignments", model: Assignment, searchable: ["title", "description"], permission: "assignments",
    scopeWhere: assignmentScope, beforeCreate: validateAssignment, beforeUpdate: validateAssignment,
    beforeRemove: async (req) => { if (await Submission.count({ where: { assignmentId: rid(req) } })) throw inUse("assignment", "it has submissions"); },
  },
  { path: "submissions", model: Submission, searchable: ["status"], permission: "submissions", scopeWhere: (req) => studentScope(req), beforeCreate: validateSubmission, beforeUpdate: validateSubmission },
  { path: "gradebook", model: GradebookEntry, searchable: ["grade"], permission: "gradebook", scopeWhere: (req) => studentScope(req), beforeCreate: validateGradebook, beforeUpdate: validateGradebook },
  { path: "grade-scales", model: GradeScale, searchable: ["name", "grade"], permission: "gradebook", beforeCreate: validateGradeScale, beforeUpdate: validateGradeScale },
  { path: "timetable", model: Timetable, searchable: ["name"], permission: "timetable", beforeCreate: validateTimetable, beforeUpdate: validateTimetable, afterCreate: refreshGrids, afterUpdate: refreshGrids },
  { path: "periods", model: Period, searchable: ["dayOfWeek", "room"], permission: "timetable", beforeCreate: validatePeriod, beforeUpdate: validatePeriod, afterCreate: refreshGrids, afterUpdate: refreshGrids, afterRemove: refreshGrids },
  { path: "syllabus", model: Syllabus, searchable: ["title"], permission: "syllabus", beforeCreate: (body, req) => validateTeachingPlan(body, req, false), beforeUpdate: (body, req) => validateTeachingPlan(body, req, false) },
  { path: "lesson-plans", model: LessonPlan, searchable: ["title"], permission: "lesson-plans", beforeCreate: (body, req) => validateTeachingPlan(body, req, true), beforeUpdate: (body, req) => validateTeachingPlan(body, req, true) },
];
