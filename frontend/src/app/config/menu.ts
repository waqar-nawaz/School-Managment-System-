export interface MenuItem {
  label: string;
  path: string;
  icon: string;
  group?: string;
  permission?: string;
  roles?: string[];
}

export const MENU: MenuItem[] = [
  { label: 'Dashboard', path: '/dashboard', icon: 'dashboard', group: 'Overview' },
  { label: 'Admissions', path: '/admissions', icon: 'clipboard', group: 'Academics', permission: 'admissions:read' },
  { label: 'Students', path: '/students', icon: 'users', group: 'Academics', permission: 'students:read' },
  { label: 'Teachers', path: '/teachers', icon: 'user-check', group: 'Academics', permission: 'teachers:read' },
  { label: 'Staff', path: '/staff', icon: 'briefcase', group: 'Academics', permission: 'staff:read' },
  { label: 'Classes', path: '/classes', icon: 'home', group: 'Academics', permission: 'classes:read' },
  { label: 'Sections', path: '/sections', icon: 'layers', group: 'Academics', permission: 'sections:read' },
  { label: 'Subjects', path: '/subjects', icon: 'book', group: 'Academics', permission: 'subjects:read' },
  { label: 'Academic Years', path: '/academic-years', icon: 'calendar', group: 'Academics', permission: 'academic:read' },
  { label: 'Terms', path: '/terms', icon: 'calendar', group: 'Academics', permission: 'academic:read' },
  { label: 'Enrolments', path: '/enrolments', icon: 'link', group: 'Academics', permission: 'students:read' },
  { label: 'Attendance', path: '/attendance', icon: 'check-square', group: 'Academics', permission: 'attendance:read' },
  { label: 'Exams', path: '/exams', icon: 'file-text', group: 'Academics', permission: 'exams:read' },
  { label: 'Exam Results', path: '/exam-results', icon: 'award', group: 'Academics', permission: 'exam-results:read' },
  { label: 'Report Cards', path: '/report-cards', icon: 'file-text', group: 'Academics', permission: 'exam-results:read' },
  { label: 'Assignments', path: '/assignments', icon: 'clipboard', group: 'Academics', permission: 'assignments:read' },
  { label: 'Gradebook', path: '/gradebook', icon: 'trending-up', group: 'Academics', permission: 'gradebook:read' },
  { label: 'Timetable', path: '/timetable', icon: 'clock', group: 'Academics', permission: 'timetable:read' },
  { label: 'Syllabus', path: '/syllabus', icon: 'list', group: 'Academics', permission: 'syllabus:read' },
  { label: 'Lesson Plans', path: '/lesson-plans', icon: 'folder', group: 'Academics', permission: 'lesson-plans:read' },

  { label: 'Invoices', path: '/invoices', icon: 'file-text', group: 'Finance', permission: 'invoices:read' },
  { label: 'Payments', path: '/payments', icon: 'credit-card', group: 'Finance', permission: 'payments:read' },
  { label: 'Fee Types', path: '/fee-types', icon: 'dollar', group: 'Finance', permission: 'fees:read' },
  { label: 'Expenses', path: '/expenses', icon: 'trending-down', group: 'Finance', permission: 'expenses:read' },
  { label: 'Payroll', path: '/payroll', icon: 'dollar', group: 'Finance', permission: 'payroll:read' },
  { label: 'Payslips', path: '/payslips', icon: 'file-text', group: 'Finance', permission: 'payroll:read' },

  { label: 'Books', path: '/books', icon: 'book', group: 'Library', permission: 'library:read' },
  { label: 'Book Issues', path: '/book-issues', icon: 'bookmark', group: 'Library', permission: 'book-issues:read' },
  { label: 'Book Fines', path: '/book-fines', icon: 'scale', group: 'Library', permission: 'book-fines:read' },

  { label: 'Routes', path: '/routes', icon: 'map', group: 'Transport', permission: 'routes:read' },
  { label: 'Vehicles', path: '/vehicles', icon: 'truck', group: 'Transport', permission: 'vehicles:read' },
  { label: 'Student Transport', path: '/student-transport', icon: 'map-pin', group: 'Transport', permission: 'student-transport:read' },

  { label: 'Hostels', path: '/hostels', icon: 'bed', group: 'Hostel', permission: 'hostels:read' },
  { label: 'Rooms', path: '/rooms', icon: 'dashboard', group: 'Hostel', permission: 'rooms:read' },
  { label: 'Allocations', path: '/hostel-allocations', icon: 'clipboard', group: 'Hostel', permission: 'hostel-allocations:read' },

  { label: 'Events', path: '/events', icon: 'calendar', group: 'Communication', permission: 'events:read' },
  { label: 'Notices', path: '/notices', icon: 'bell', group: 'Communication', permission: 'notices:read' },
  { label: 'Announcements', path: '/announcements', icon: 'megaphone', group: 'Communication', permission: 'announcements:read' },
  { label: 'Messages', path: '/messages', icon: 'mail', group: 'Communication', permission: 'messages:read' },
  { label: 'Complaints', path: '/complaints', icon: 'message', group: 'Communication', permission: 'complaints:read' },

  { label: 'Certificates', path: '/certificates', icon: 'award', group: 'Services', permission: 'certificates:read' },
  { label: 'Health Records', path: '/health-records', icon: 'heart', group: 'Services', permission: 'health-records:read' },
  { label: 'Discipline', path: '/discipline-records', icon: 'alert', group: 'Services', permission: 'discipline-records:read' },
  { label: 'Inventory', path: '/inventory', icon: 'package', group: 'Services', permission: 'inventory:read' },
  { label: 'Assets', path: '/assets', icon: 'monitor', group: 'Services', permission: 'inventory:read' },
  { label: 'Media', path: '/media', icon: 'image', group: 'Services', permission: 'media:read' },

  { label: 'Users', path: '/users', icon: 'user', group: 'Administration', permission: 'users:read' },
  { label: 'Roles', path: '/roles', icon: 'shield', group: 'Administration', permission: 'roles:read' },
  { label: 'Permissions', path: '/permissions', icon: 'lock', group: 'Administration', permission: 'permissions:read' },
  { label: 'Audit Logs', path: '/audit-logs', icon: 'search', group: 'Administration', permission: 'audit-logs:read' },
  { label: 'Settings', path: '/settings', icon: 'settings', group: 'Administration', permission: 'settings:manage' },
  { label: 'Reports', path: '/reports', icon: 'bar-chart', group: 'Administration', permission: 'reports:read' },
];
