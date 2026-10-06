export interface PermissionMap {
  [role: string]: string[];
}

/**
 * Permission matrix used by the `authorize` middleware.
 * A permission is `module:action` (e.g. `students:create`).
 * `*` grants all. Roles:
 * super_admin, admin, principal, teacher, parent, student,
 * accountant, librarian, transport_manager, hostel_warden, receptionist
 */
export const ROLE_PERMISSIONS: PermissionMap = {
  
  super_admin: ["*"],
  admin: ["*"],

  principal: [
    "dashboard:read",
    "reports:read",
    "reports:export",
    "audit-logs:read",
    "users:read",
    "students:read", "students:create", "students:update", "students:delete",
    "teachers:read", "teachers:create", "teachers:update",
    "staff:read", "staff:create", "staff:update",
    "admissions:read", "admissions:create", "admissions:update",
    "academic:read", "academic:create", "academic:update",
    "classes:read", "classes:create", "classes:update",
    "sections:read", "sections:create", "sections:update",
    "subjects:read", "subjects:create", "subjects:update",
    "attendance:read", "attendance:create", "attendance:update",
    "exams:read", "exams:create", "exams:update",
    "exam-results:read", "exam-results:create", "exam-results:update",
    "assignments:read", "assignments:create", "assignments:update",
    "submissions:read", "submissions:update",
    "gradebook:read", "gradebook:create", "gradebook:update",
    "timetable:read", "timetable:create", "timetable:update",
    "syllabus:read", "syllabus:create", "syllabus:update",
    "lesson-plans:read", "lesson-plans:create", "lesson-plans:update",
    "fees:read", "fee-types:read", "invoices:read", "payments:read",
    "expenses:read", "payroll:read", "payslips:read",
    "leaves:read", "leaves:create", "leaves:update", "leaves:approve",
    "library:read", "book-issues:read", "book-fines:read",
    "routes:read", "route-stops:read", "vehicles:read", "student-transport:read",
    "hostels:read", "rooms:read", "beds:read", "hostel-allocations:read",
    "events:read", "events:create", "notices:read", "notices:create",
    "announcements:read", "announcements:create",
    "messages:read", "messages:create", "messages:send",
    "notifications:read", "notifications:update",
    "certificates:read", "certificates:create", "certificates:update",
    "health-records:read", "discipline-records:read", "discipline-records:update",
    "complaints:read", "complaints:create", "complaints:update",
    "inventory:read", "assets:read", "visitors:read", "visitors:create",
  ],

  teacher: [
    "dashboard:read",
    "students:read",
    "academic:read",
    "classes:read", "sections:read", "subjects:read",
    "attendance:read", "attendance:create", "attendance:update",
    "assignments:read", "assignments:create", "assignments:update",
    "submissions:read", "submissions:update",
    "exams:read", "exams:create",
    "exam-results:read", "exam-results:create", "exam-results:update",
    "gradebook:read", "gradebook:create", "gradebook:update",
    "lesson-plans:read", "lesson-plans:create", "lesson-plans:update",
    "syllabus:read", "timetable:read",
    "messages:read", "messages:create", "messages:send",
    "notices:read", "events:read", "announcements:read", "report-cards:read",
    "library:read", "book-issues:read",
    "leaves:read", "leaves:create", "leaves:update",
    "notifications:read", "notifications:update",
  ],

  parent: [
    "dashboard:read",
    "students:read",
    "attendance:read",
    "exam-results:read",
    "report-cards:read",
    "fees:read", "fee-types:read",
    "invoices:read", "payments:read",
    "homework:read", "assignments:read",
    "notices:read", "announcements:read",
    "messages:read", "messages:create", "messages:send",
    "leaves:read", "leaves:create", "leaves:update",
    "complaints:read", "complaints:create",
    "timetable:read", "events:read",
    "certificates:read", "library:read", "book-issues:read",
    "notifications:read", "notifications:update",
  ],

  student: [
    "dashboard:read",
    "attendance:read",
    "exam-results:read",
    "report-cards:read",
    "homework:read", "assignments:read",
    "submissions:read", "submissions:create",
    "notices:read", "announcements:read",
    "messages:read", "messages:create", "messages:send",
    "timetable:read", "events:read",
    "library:read", "book-issues:read",
    "leaves:read", "leaves:create", "leaves:update",
    "notifications:read", "notifications:update",
  ],

  accountant: [
    "dashboard:read",
    "academic:read", "classes:read", "sections:read", "students:read",
    "fees:read", "fees:create",
    "fee-types:read", "fee-types:create", "fee-types:update",
    "invoices:read", "invoices:create", "invoices:update", "invoices:delete",
    "payments:read", "payments:create",
    "receipts:read", "receipts:create", "refunds:create", "refunds:approve",
    "expenses:read", "expenses:create", "expenses:update", "expenses:approve", "expenses:pay",
    "payroll:read", "payroll:create", "payroll:update",
    "payslips:read", "payslips:create",
    "reports:read", "reports:export",
    "leaves:approve",
    "notifications:read", "notifications:update",
  ],

  librarian: [
    "dashboard:read",
    "students:read",
    "library:read", "library:create", "library:update", "library:delete",
    "book-issues:read", "book-issues:create", "book-issues:update",
    "book-fines:read", "book-fines:create", "book-fines:update",
    "notices:read", "events:read",
    "notifications:read", "notifications:update",
  ],

  transport_manager: [
    "dashboard:read",
    "students:read",
    "routes:read", "routes:create", "routes:update", "routes:delete",
    "route-stops:read", "route-stops:create", "route-stops:update",
    "vehicles:read", "vehicles:create", "vehicles:update",
    "driver-assignments:read", "driver-assignments:create",
    "student-transport:read", "student-transport:create", "student-transport:update",
    "notices:read",
    "notifications:read", "notifications:update",
  ],

  hostel_warden: [
    "dashboard:read",
    "students:read",
    "attendance:read",
    "hostels:read", "hostels:create", "hostels:update",
    "rooms:read", "rooms:create", "rooms:update",
    "beds:read", "beds:create", "beds:update",
    "hostel-allocations:read", "hostel-allocations:create", "hostel-allocations:update",
    "notices:read",
    "notifications:read", "notifications:update",
  ],

  receptionist: [
    "dashboard:read",
    "admissions:read", "admissions:create", "admissions:update",
    "students:read", "students:create",
    "visitors:read", "visitors:create",
    "complaints:read", "complaints:create",
    "certificates:read", "certificates:create",
    "messages:read", "messages:create", "messages:send",
    "notices:read", "events:read",
    "notifications:read", "notifications:update",
  ],

  // Generic support staff: read-only school info + own leaves/messages.
  staff: [
    "dashboard:read",
    "notices:read", "events:read", "announcements:read", "timetable:read",
    "leaves:read", "leaves:create", "leaves:update",
    "messages:read", "messages:create", "messages:send",
    "notifications:read", "notifications:update",
  ],
};

export function permissionsForRole(role: string): string[] {
  return ROLE_PERMISSIONS[role] || [];
}

export function hasPermission(role: string, permission: string): boolean {
  const perms = permissionsForRole(role);
  if (perms.includes("*")) return true;
  return perms.includes(permission);
}