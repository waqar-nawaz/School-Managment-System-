export interface PermissionMap {
  [role: string]: string[];
}

export const ROLE_PERMISSIONS: PermissionMap = {
  super_admin: ['*'],
  admin: ['*', 'users:read', 'users:create', 'users:update', 'users:delete', 'settings:manage', 'audit-logs:read', 'reports:read', 'reports:export'],
  principal: [
    'dashboard:read', 'students:read', 'students:create', 'students:update',
    'teachers:read', 'teachers:create', 'teachers:update', 'staff:read',
    'classes:read', 'sections:read', 'attendance:read', 'exams:read',
    'exam-results:read', 'timetable:read', 'reports:read', 'reports:export',
    'notices:create', 'messages:send', 'complaints:read', 'complaints:update',
  ],
  teacher: [
    'dashboard:read', 'students:read', 'classes:read', 'sections:read',
    'attendance:read', 'attendance:create', 'attendance:update',
    'assignments:create', 'assignments:update', 'submissions:read', 'submissions:update',
    'exams:create', 'exam-results:create', 'gradebook:read', 'gradebook:update',
    'lesson-plans:create', 'timetable:read', 'messages:send', 'notices:read',
  ],
  parent: [
    'dashboard:read', 'students:read', 'attendance:read', 'exam-results:read',
    'report-cards:read', 'invoices:read', 'homework:read', 'notices:read',
    'messages:send', 'messages:read', 'leaves:create', 'complaints:create',
    'timetable:read', 'events:read',
  ],
  student: [
    'dashboard:read', 'attendance:read', 'exam-results:read', 'report-cards:read',
    'homework:read', 'submissions:create', 'notices:read', 'messages:send',
    'messages:read', 'timetable:read', 'events:read', 'book-issues:create',
  ],
  accountant: [
    'dashboard:read', 'students:read', 'invoices:read', 'invoices:create',
    'invoices:update', 'payments:read', 'payments:create', 'receipts:read',
    'expenses:read', 'expenses:create', 'payroll:read', 'payroll:create',
    'reports:read', 'reports:export',
  ],
  librarian: [
    'dashboard:read', 'library:read', 'library:create', 'book-issues:read',
    'book-issues:create', 'book-issues:update', 'book-fines:read', 'book-fines:create',
    'students:read', 'notices:read',
  ],
  transport_manager: [
    'dashboard:read', 'routes:read', 'routes:create', 'vehicles:read',
    'vehicles:create', 'student-transport:read', 'students:read', 'notices:read',
  ],
  hostel_warden: [
    'dashboard:read', 'hostels:read', 'rooms:read', 'rooms:create', 'beds:read',
    'hostel-allocations:read', 'hostel-allocations:create', 'hostel-allocations:update',
    'students:read', 'notices:read', 'attendance:read',
  ],
  receptionist: [
    'dashboard:read', 'admissions:read', 'admissions:create', 'students:read',
    'students:create', 'visitors:create', 'complaints:create', 'notices:read',
  ],
};