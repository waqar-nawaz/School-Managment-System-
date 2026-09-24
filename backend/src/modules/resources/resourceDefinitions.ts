import { Request } from "express";
import {
  Role, Permission, Branch, AcademicYear, Term, SchoolClass, Section, Subject,
  ClassSubject, Enrolment, Parent, Teacher, Staff, Exam, ExamSchedule, ExamResult,
  ReportCard, Assignment, Submission, GradebookEntry, GradeScale, Timetable, Period,
  FeeType, Expense, PayrollItem, Payslip, LeaveRequest, Book, BookCopy, BookFine,
  Route, RouteStop, Vehicle, DriverAssignment, StudentTransport, Hostel, Room, Bed,
  HostelAllocation, Event, Notice, Announcement, Message, Notification, Syllabus,
  LessonPlan, HealthRecord, DisciplineRecord, Complaint, InventoryItem, Asset,
  AuditLog, VisitorLog,
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

export const RESOURCES: ResourceDefinition[] = [
  { path: "roles", model: Role, searchable: ["name", "label", "description"], permission: "roles" },
  { path: "permissions", model: Permission, searchable: ["key", "label", "category"], permission: "permissions" },
  { path: "branches", model: Branch, searchable: ["name", "code", "city", "email"], permission: "branches" },
  { path: "academic-years", model: AcademicYear, searchable: ["name"], permission: "academic" },
  { path: "terms", model: Term, searchable: ["name"], permission: "academic" },
  { path: "classes", model: SchoolClass, searchable: ["name", "level"], permission: "classes" },
  { path: "sections", model: Section, searchable: ["name"], permission: "sections" },
  { path: "subjects", model: Subject, searchable: ["name", "code"], permission: "subjects" },
  { path: "class-subjects", model: ClassSubject, searchable: [], permission: "subjects" },
  { path: "enrolments", model: Enrolment, searchable: ["rollNo", "status"], permission: "students" },
  { path: "parents", model: Parent, searchable: ["fullName", "phone", "email"], permission: "students" },
  { path: "teachers", model: Teacher, searchable: ["staffNo", "firstName", "lastName", "email"], permission: "teachers" },
  { path: "staff", model: Staff, searchable: ["staffNo", "firstName", "lastName", "department"], permission: "staff" },
  { path: "exams", model: Exam, searchable: ["name", "examType", "status"], permission: "exams" },
  { path: "exam-schedules", model: ExamSchedule, searchable: ["room", "startTime"], permission: "exams" },
  { path: "exam-results", model: ExamResult, searchable: ["grade", "remarks"], permission: "exam-results" },
  {
    path: "report-cards", model: ReportCard, searchable: ["grade"], permission: "exam-results",
    // studentId is required by the model but not on the form — derive it from the enrolment.
    beforeCreate: async (body) => {
      if (body.enrolmentId && !body.studentId) {
        const enrolment = await Enrolment.findByPk(body.enrolmentId);
        if (enrolment) body.studentId = enrolment.studentId;
      }
      return body;
    },
  },
  { path: "assignments", model: Assignment, searchable: ["title", "description"], permission: "assignments" },
  { path: "submissions", model: Submission, searchable: ["status"], permission: "assignments" },
  { path: "gradebook", model: GradebookEntry, searchable: ["grade"], permission: "gradebook" },
  { path: "grade-scales", model: GradeScale, searchable: ["name", "grade"], permission: "gradebook" },
  { path: "timetable", model: Timetable, searchable: ["name"], permission: "timetable" },
  { path: "periods", model: Period, searchable: ["dayOfWeek", "room"], permission: "timetable" },
  { path: "fee-types", model: FeeType, searchable: ["name", "category"], permission: "fees" },
  { path: "expenses", model: Expense, searchable: ["title", "category", "status"], permission: "expenses" },
  {
    path: "payroll", model: PayrollItem, searchable: ["month", "status"], permission: "payroll",
    beforeCreate: (body) => {
      if (body.netPay === undefined || body.netPay === null || body.netPay === "") {
        body.netPay = Number(body.basicSalary ?? 0) + Number(body.allowances ?? 0) - Number(body.deductions ?? 0);
      }
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
      if (!body.userId) body.userId = req.user?.id;
      return body;
    },
  },
  { path: "books", model: Book, searchable: ["title", "author", "isbn", "category"], permission: "library" },
  { path: "book-copies", model: BookCopy, searchable: ["accessionNo", "status"], permission: "library" },
  { path: "book-fines", model: BookFine, searchable: ["receiptNo", "status"], permission: "book-fines" },
  { path: "routes", model: Route, searchable: ["name", "startPoint", "endPoint"], permission: "routes" },
  { path: "route-stops", model: RouteStop, searchable: ["name"], permission: "route-stops" },
  { path: "vehicles", model: Vehicle, searchable: ["registrationNo", "model"], permission: "vehicles" },
  { path: "driver-assignments", model: DriverAssignment, searchable: [], permission: "driver-assignments" },
  { path: "student-transport", model: StudentTransport, searchable: [], permission: "student-transport" },
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
      if (body.bedId) {
        const bed = await Bed.findByPk(body.bedId);
        if (bed) {
          body.roomId = bed.roomId;
          const room = await Room.findByPk(bed.roomId);
          if (room) body.hostelId = room.hostelId;
        }
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
      if (!body.senderId) body.senderId = req.user?.id;
      return body;
    },
  },
  { path: "notifications", model: Notification, searchable: ["title"], permission: "notifications", readonly: true },
  { path: "syllabus", model: Syllabus, searchable: ["title"], permission: "syllabus" },
  { path: "lesson-plans", model: LessonPlan, searchable: ["title"], permission: "lesson-plans" },
  { path: "health-records", model: HealthRecord, searchable: ["bloodGroup"], permission: "health-records", readonly: true },
  { path: "discipline-records", model: DisciplineRecord, searchable: ["title", "type", "status"], permission: "discipline-records" },
  {
    path: "complaints", model: Complaint, searchable: ["title", "category", "status"], permission: "complaints",
    beforeCreate: (body, req) => {
      if (!body.submittedBy) body.submittedBy = req.user?.id;
      return body;
    },
  },
  { path: "inventory", model: InventoryItem, searchable: ["name", "sku", "category"], permission: "inventory" },
  { path: "assets", model: Asset, searchable: ["name", "assetCode", "category"], permission: "inventory" },
  { path: "audit-logs", model: AuditLog, searchable: ["action", "entity"], permission: "audit-logs", readonly: true },
  { path: "visitor-logs", model: VisitorLog, searchable: ["visitorName", "purpose"], permission: "visitors" },
];