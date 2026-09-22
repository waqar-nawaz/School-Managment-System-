export interface MenuItem {
  label: string;
  path: string;
  icon: string;
  group?: string;
  permission?: string;
  roles?: string[];
}

export const MENU: MenuItem[] = [
  { label: 'Dashboard', path: '/dashboard', icon: '📊', group: 'Overview' },
  { label: 'Admissions', path: '/admissions', icon: '📝', group: 'Academics', permission: 'admissions:read' },
  { label: 'Students', path: '/students', icon: '👨‍🎓', group: 'Academics', permission: 'students:read' },
  { label: 'Teachers', path: '/teachers', icon: '👩‍🏫', group: 'Academics', permission: 'teachers:read' },
  { label: 'Staff', path: '/staff', icon: '🧑‍💼', group: 'Academics', permission: 'staff:read' },
  { label: 'Classes', path: '/classes', icon: '🏫', group: 'Academics', permission: 'classes:read' },
  { label: 'Sections', path: '/sections', icon: '📚', group: 'Academics', permission: 'sections:read' },
  { label: 'Subjects', path: '/subjects', icon: '📖', group: 'Academics', permission: 'subjects:read' },
  { label: 'Academic Years', path: '/academic-years', icon: '🗓️', group: 'Academics', permission: 'academic:read' },
  { label: 'Terms', path: '/terms', icon: '🧭', group: 'Academics', permission: 'academic:read' },
  { label: 'Enrolments', path: '/enrolments', icon: '🔗', group: 'Academics', permission: 'students:read' },
  { label: 'Attendance', path: '/attendance', icon: '✅', group: 'Academics', permission: 'attendance:read' },
  { label: 'Exams', path: '/exams', icon: '🧪', group: 'Academics', permission: 'exams:read' },
  { label: 'Exam Results', path: '/exam-results', icon: '🏅', group: 'Academics', permission: 'exam-results:read' },
  { label: 'Report Cards', path: '/report-cards', icon: '📄', group: 'Academics', permission: 'exam-results:read' },
  { label: 'Assignments', path: '/assignments', icon: '📌', group: 'Academics', permission: 'assignments:read' },
  { label: 'Gradebook', path: '/gradebook', icon: '📈', group: 'Academics', permission: 'gradebook:read' },
  { label: 'Timetable', path: '/timetable', icon: '🕒', group: 'Academics', permission: 'timetable:read' },
  { label: 'Syllabus', path: '/syllabus', icon: '🧾', group: 'Academics', permission: 'syllabus:read' },
  { label: 'Lesson Plans', path: '/lesson-plans', icon: '🗂️', group: 'Academics', permission: 'lesson-plans:read' },

  { label: 'Invoices', path: '/invoices', icon: '🧾', group: 'Finance', permission: 'invoices:read' },
  { label: 'Payments', path: '/payments', icon: '💳', group: 'Finance', permission: 'payments:read' },
  { label: 'Fee Types', path: '/fee-types', icon: '💰', group: 'Finance', permission: 'fees:read' },
  { label: 'Expenses', path: '/expenses', icon: '📉', group: 'Finance', permission: 'expenses:read' },
  { label: 'Payroll', path: '/payroll', icon: '🪙', group: 'Finance', permission: 'payroll:read' },
  { label: 'Payslips', path: '/payslips', icon: '💵', group: 'Finance', permission: 'payroll:read' },

  { label: 'Books', path: '/books', icon: '📕', group: 'Library', permission: 'library:read' },
  { label: 'Book Issues', path: '/book-issues', icon: '🔖', group: 'Library', permission: 'book-issues:read' },
  { label: 'Book Fines', path: '/book-fines', icon: '⚖️', group: 'Library', permission: 'book-fines:read' },

  { label: 'Routes', path: '/routes', icon: '🚌', group: 'Transport', permission: 'routes:read' },
  { label: 'Vehicles', path: '/vehicles', icon: '🚍', group: 'Transport', permission: 'vehicles:read' },
  { label: 'Student Transport', path: '/student-transport', icon: '📍', group: 'Transport', permission: 'student-transport:read' },

  { label: 'Hostels', path: '/hostels', icon: '🛏️', group: 'Hostel', permission: 'hostels:read' },
  { label: 'Rooms', path: '/rooms', icon: '🚪', group: 'Hostel', permission: 'rooms:read' },
  { label: 'Allocations', path: '/hostel-allocations', icon: '📋', group: 'Hostel', permission: 'hostel-allocations:read' },

  { label: 'Events', path: '/events', icon: '🎉', group: 'Communication', permission: 'events:read' },
  { label: 'Notices', path: '/notices', icon: '📢', group: 'Communication', permission: 'notices:read' },
  { label: 'Announcements', path: '/announcements', icon: '📣', group: 'Communication', permission: 'announcements:read' },
  { label: 'Messages', path: '/messages', icon: '✉️', group: 'Communication', permission: 'messages:read' },
  { label: 'Complaints', path: '/complaints', icon: '🛎️', group: 'Communication', permission: 'complaints:read' },

  { label: 'Certificates', path: '/certificates', icon: '🎓', group: 'Services', permission: 'certificates:read' },
  { label: 'Health Records', path: '/health-records', icon: '🩺', group: 'Services', permission: 'health-records:read' },
  { label: 'Discipline', path: '/discipline-records', icon: '⚠️', group: 'Services', permission: 'discipline-records:read' },
  { label: 'Inventory', path: '/inventory', icon: '📦', group: 'Services', permission: 'inventory:read' },
  { label: 'Assets', path: '/assets', icon: '🖥️', group: 'Services', permission: 'inventory:read' },
  { label: 'Media', path: '/media', icon: '🖼️', group: 'Services', permission: 'media:read' },

  { label: 'Users', path: '/users', icon: '👤', group: 'Administration', permission: 'users:read' },
  { label: 'Roles', path: '/roles', icon: '🛡️', group: 'Administration', permission: 'roles:read' },
  { label: 'Permissions', path: '/permissions', icon: '🔐', group: 'Administration', permission: 'permissions:read' },
  { label: 'Audit Logs', path: '/audit-logs', icon: '🕵️', group: 'Administration', permission: 'audit-logs:read' },
  { label: 'Settings', path: '/settings', icon: '⚙️', group: 'Administration', permission: 'settings:manage' },
  { label: 'Reports', path: '/reports', icon: '📊', group: 'Administration', permission: 'reports:read' },
];