import { User } from "./User";
import { Role } from "./Role";
import { Permission } from "./Permission";
import { RolePermission } from "./RolePermission";
import { RefreshToken } from "./RefreshToken";
import { Settings } from "./Settings";
import { Branch } from "./Branch";
import { AcademicYear } from "./AcademicYear";
import { Term } from "./Term";
import { SchoolClass } from "./SchoolClass";
import { Section } from "./Section";
import { Subject } from "./Subject";
import { ClassSubject } from "./ClassSubject";
import { Student } from "./Student";
import { Parent } from "./Parent";
import { StudentGuardian } from "./StudentGuardian";
import { Teacher } from "./Teacher";
import { Staff } from "./Staff";
import { AdmissionApplication } from "./AdmissionApplication";
import { Enrolment } from "./Enrolment";
import { Attendance } from "./Attendance";
import { Exam } from "./Exam";
import { ExamSchedule } from "./ExamSchedule";
import { ExamResult } from "./ExamResult";
import { ReportCard } from "./ReportCard";
import { Assignment } from "./Assignment";
import { Submission } from "./Submission";
import { GradeScale } from "./GradeScale";
import { GradebookEntry } from "./GradebookEntry";
import { Period, Timetable } from "./Period";
import { FeeType } from "./FeeType";
import { Invoice } from "./Invoice";
import { Payment } from "./Payment";
import { Receipt } from "./Receipt";
import { Refund } from "./Refund";
import { Expense } from "./Expense";
import { PayrollItem } from "./PayrollItem";
import { Payslip } from "./Payslip";
import { LeaveRequest } from "./LeaveRequest";
import { Book } from "./Book";
import { BookCopy } from "./BookCopy";
import { BookIssue } from "./BookIssue";
import { BookFine } from "./BookFine";
import { Route, RouteStop } from "./Route";
import { Vehicle, DriverAssignment, StudentTransport } from "./Vehicle";
import { Hostel, Room, Bed, HostelAllocation } from "./Hostel";
import { Event, Notice, Announcement } from "./Event";
import { Message, MessageRecipient, Notification } from "./Message";
import { Syllabus, LessonPlan } from "./Syllabus";
import { Certificate, HealthRecord, DisciplineRecord } from "./Certificate";
import { Complaint, InventoryItem, Asset } from "./Complaint";
import { AuditLog } from "./AuditLog";
import { Media } from "./Media";
import { VisitorLog } from "./VisitorLog";

export const models = [
  User,
  Role,
  Permission,
  RolePermission,
  RefreshToken,
  Settings,
  Branch,
  AcademicYear,
  Term,
  SchoolClass,
  Section,
  Subject,
  ClassSubject,
  Student,
  Parent,
  StudentGuardian,
  Teacher,
  Staff,
  AdmissionApplication,
  Enrolment,
  Attendance,
  Exam,
  ExamSchedule,
  ExamResult,
  ReportCard,
  Assignment,
  Submission,
  GradeScale,
  GradebookEntry,
  Period,
  Timetable,
  FeeType,
  Invoice,
  Payment,
  Receipt,
  Refund,
  Expense,
  PayrollItem,
  Payslip,
  LeaveRequest,
  Book,
  BookCopy,
  BookIssue,
  BookFine,
  Route,
  RouteStop,
  Vehicle,
  DriverAssignment,
  StudentTransport,
  Hostel,
  Room,
  Bed,
  HostelAllocation,
  Event,
  Notice,
  Announcement,
  Message,
  MessageRecipient,
  Notification,
  Syllabus,
  LessonPlan,
  Certificate,
  HealthRecord,
  DisciplineRecord,
  Complaint,
  InventoryItem,
  Asset,
  AuditLog,
  Media,
  VisitorLog,
];

/**
 * Associations. Kept central so model files stay declarative and free of
 * circular-import pitfalls. New relations are added here as the domain grows.
 */
export function defineAssociations(): void {
  // Branch
  Branch.hasMany(User, { as: "users", foreignKey: "branchId" });
  Branch.hasMany(SchoolClass, { as: "classes", foreignKey: "branchId" });
  Branch.hasMany(Student, { as: "students", foreignKey: "branchId" });

  // Roles / permissions
  Role.hasMany(User, { foreignKey: "role", sourceKey: "name" });
  User.belongsTo(Role, { foreignKey: "role", targetKey: "name", as: "roleInfo" });

  // Auth sessions
  User.hasMany(RefreshToken, { as: "refreshTokens", foreignKey: "userId" });
  RefreshToken.belongsTo(User, { foreignKey: "userId" });

  // Academic
  AcademicYear.hasMany(Term, { as: "terms", foreignKey: "academicYearId" });
  Term.belongsTo(AcademicYear, { foreignKey: "academicYearId" });

  SchoolClass.hasMany(Section, { as: "sections", foreignKey: "classId" });
  Section.belongsTo(SchoolClass, { foreignKey: "classId" });

  SchoolClass.belongsToMany(Subject, { through: ClassSubject, foreignKey: "classId", otherKey: "subjectId", as: "subjects" });
  Subject.belongsToMany(SchoolClass, { through: ClassSubject, foreignKey: "subjectId", otherKey: "classId", as: "classes" });

  // People
  User.hasOne(Student, { as: "student", foreignKey: "userId" });
  Student.belongsTo(User, { as: "user", foreignKey: "userId" });
  User.hasOne(Parent, { as: "parent", foreignKey: "userId" });
  Parent.belongsTo(User, { as: "user", foreignKey: "userId" });
  User.hasOne(Teacher, { as: "teacher", foreignKey: "userId" });
  Teacher.belongsTo(User, { as: "user", foreignKey: "userId" });
  User.hasOne(Staff, { as: "staff", foreignKey: "userId" });
  Staff.belongsTo(User, { as: "user", foreignKey: "userId" });

  Student.belongsToMany(Parent, { through: StudentGuardian, as: "guardians", foreignKey: "studentId", otherKey: "parentId" });
  Parent.belongsToMany(Student, { through: StudentGuardian, as: "wards", foreignKey: "parentId", otherKey: "studentId" });

  // Enrolment / attendance
  Student.hasMany(Enrolment, { as: "enrolments", foreignKey: "studentId" });
  Enrolment.belongsTo(Student, { foreignKey: "studentId" });
  Enrolment.belongsTo(SchoolClass, { as: "class", foreignKey: "classId" });
  Enrolment.belongsTo(Section, { as: "section", foreignKey: "sectionId" });

  Student.hasMany(Attendance, { as: "attendance", foreignKey: "studentId" });
  Attendance.belongsTo(Student, { foreignKey: "studentId" });

  // Exams
  Exam.hasMany(ExamSchedule, { as: "schedule", foreignKey: "examId" });
  ExamSchedule.belongsTo(Exam, { foreignKey: "examId" });
  Exam.hasMany(ExamResult, { as: "results", foreignKey: "examId" });
  ExamResult.belongsTo(Exam, { foreignKey: "examId" });
  ExamResult.belongsTo(Student, { foreignKey: "studentId" });
  ExamResult.belongsTo(Subject, { foreignKey: "subjectId" });

  // Report cards / gradebook
  Enrolment.hasMany(ReportCard, { as: "reportCards", foreignKey: "enrolmentId" });
  ReportCard.belongsTo(Student, { foreignKey: "studentId" });
  Student.hasMany(ReportCard, { as: "reportCards", foreignKey: "studentId" });

  GradebookEntry.belongsTo(Student, { foreignKey: "studentId" });

  // Assignments
  Assignment.belongsTo(Teacher, { foreignKey: "createdBy", as: "author" });
  Assignment.hasMany(Submission, { as: "submissions", foreignKey: "assignmentId" });
  Submission.belongsTo(Assignment, { foreignKey: "assignmentId" });
  Submission.belongsTo(Student, { foreignKey: "studentId" });

  // Timetable
  Period.belongsTo(SchoolClass, { foreignKey: "classId" });
  Period.belongsTo(Teacher, { foreignKey: "teacherId" });

  // Finance
  Student.hasMany(Invoice, { as: "invoices", foreignKey: "studentId" });
  Invoice.belongsTo(Student, { foreignKey: "studentId" });
  Invoice.belongsTo(Term, { foreignKey: "termId" });
  Invoice.hasMany(Payment, { as: "payments", foreignKey: "invoiceId" });
  Payment.belongsTo(Invoice, { foreignKey: "invoiceId" });
  Payment.belongsTo(Student, { foreignKey: "studentId" });
  Receipt.belongsTo(Payment, { foreignKey: "paymentId" });
  Refund.belongsTo(Invoice, { foreignKey: "invoiceId" });

  PayrollItem.hasMany(Payslip, { as: "payslips", foreignKey: "payrollItemId" });
  Payslip.belongsTo(PayrollItem, { foreignKey: "payrollItemId" });
  PayrollItem.belongsTo(Teacher, { foreignKey: "teacherId" });
  PayrollItem.belongsTo(Staff, { foreignKey: "staffId" });

  // Library
  Book.hasMany(BookCopy, { as: "copies", foreignKey: "bookId" });
  BookCopy.belongsTo(Book, { foreignKey: "bookId" });
  BookCopy.hasMany(BookIssue, { as: "issues", foreignKey: "bookCopyId" });
  BookIssue.belongsTo(BookCopy, { foreignKey: "bookCopyId" });
  BookIssue.belongsTo(User, { as: "borrower", foreignKey: "userId" });
  BookIssue.hasMany(BookFine, { as: "fines", foreignKey: "bookIssueId" });
  BookFine.belongsTo(BookIssue, { foreignKey: "bookIssueId" });

  // Transport
  Route.hasMany(RouteStop, { as: "stops", foreignKey: "routeId" });
  RouteStop.belongsTo(Route, { foreignKey: "routeId" });
  Vehicle.hasMany(DriverAssignment, { as: "drivers", foreignKey: "vehicleId" });
  DriverAssignment.belongsTo(Vehicle, { foreignKey: "vehicleId" });
  DriverAssignment.belongsTo(User, { as: "driver", foreignKey: "driverId" });
  StudentTransport.belongsTo(Route, { foreignKey: "routeId" });
  StudentTransport.belongsTo(Student, { foreignKey: "studentId" });

  // Hostel
  Hostel.hasMany(Room, { as: "rooms", foreignKey: "hostelId" });
  Room.belongsTo(Hostel, { foreignKey: "hostelId" });
  Room.hasMany(Bed, { as: "beds", foreignKey: "roomId" });
  Bed.belongsTo(Room, { foreignKey: "roomId" });
  HostelAllocation.belongsTo(Room, { foreignKey: "roomId" });
  HostelAllocation.belongsTo(Bed, { foreignKey: "bedId" });
  HostelAllocation.belongsTo(Student, { foreignKey: "studentId" });

  // Communication
  User.hasMany(Message, { as: "sentMessages", foreignKey: "senderId" });
  Message.belongsTo(User, { as: "sender", foreignKey: "senderId" });
  Message.belongsToMany(User, { through: MessageRecipient, as: "recipients", foreignKey: "messageId", otherKey: "recipientId" });
  User.hasMany(Notification, { as: "notifications", foreignKey: "userId" });
  Notification.belongsTo(User, { foreignKey: "userId" });

  // Miscellaneous
  Certificate.belongsTo(Student, { foreignKey: "studentId" });
  HealthRecord.belongsTo(Student, { foreignKey: "studentId" });
  DisciplineRecord.belongsTo(Student, { foreignKey: "studentId" });
  Complaint.belongsTo(User, { as: "reporter", foreignKey: "submittedBy" });
  AuditLog.belongsTo(User, { foreignKey: "userId" });
  Media.belongsTo(User, { foreignKey: "uploadedBy" });
  VisitorLog.belongsTo(User, { foreignKey: "registeredBy" });
}

export { RolePermission } from "./RolePermission";
export {
  User, Role, Permission, RefreshToken, Settings, Branch, AcademicYear, Term,
  SchoolClass, Section, Subject, ClassSubject, Student, Parent, StudentGuardian,
  Teacher, Staff, AdmissionApplication, Enrolment, Attendance, Exam, ExamSchedule,
  ExamResult, ReportCard, Assignment, Submission, GradeScale, GradebookEntry,
  Period, Timetable, FeeType, Invoice, Payment, Receipt, Refund, Expense,
  PayrollItem, Payslip, LeaveRequest, Book, BookCopy, BookIssue, BookFine,
  Route, RouteStop, Vehicle, DriverAssignment, StudentTransport, Hostel, Room,
  Bed, HostelAllocation, Event, Notice, Announcement, Message, MessageRecipient,
  Notification, Syllabus, LessonPlan, Certificate, HealthRecord, DisciplineRecord,
  Complaint, InventoryItem, Asset, AuditLog, Media, VisitorLog,
};