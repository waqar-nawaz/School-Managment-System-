export const USER_ROLES = [
  "super_admin",
  "admin",
  "principal",
  "teacher",
  "parent",
  "student",
  "accountant",
  "librarian",
  "transport_manager",
  "hostel_warden",
  "receptionist",
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const GENDERS = ["male", "female", "other"] as const;
export const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const;

export const ATTENDANCE_STATUS = ["present", "absent", "late", "excused", "holiday"] as const;
export const PAYMENT_STATUS = ["pending", "partial", "paid", "overdue", "cancelled"] as const;
export const BOOK_ISSUE_STATUS = ["requested", "issued", "returned", "overdue", "lost"] as const;
export const LEAVE_STATUS = ["pending", "approved", "rejected", "cancelled"] as const;
export const ADMISSION_STATUS = ["enquiry", "applied", "shortlisted", "admitted", "rejected", "waitlisted"] as const;
export const EXAM_TYPES = ["weekly", "monthly", "midterm", "final", "quiz"] as const;
export const CERTIFICATE_TYPES = ["transfer", "character", "bonafide", "provisional", "mark_sheet"] as const;

export const MODULE_ALIASES: Record<string, string> = {
  "academic-years": "AcademicYear",
  "fee-types": "FeeType",
  "book-issues": "BookIssue",
  "book-fines": "BookFine",
  "route-stops": "RouteStop",
  "driver-assignments": "DriverAssignment",
  "student-transport": "StudentTransport",
  "hostel-allocations": "HostelAllocation",
  "exam-schedules": "ExamSchedule",
  "exam-results": "ExamResult",
  "report-cards": "ReportCard",
  "lesson-plans": "LessonPlan",
  "grade-scales": "GradeScale",
  "health-records": "HealthRecord",
  "discipline-records": "DisciplineRecord",
};