export const USER_ROLES = [
  'super_admin',
  'admin',
  'principal',
  'teacher',
  'parent',
  'student',
  'accountant',
  'librarian',
  'transport_manager',
  'hostel_warden',
  'receptionist',
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin',
  admin: 'Administrator',
  principal: 'Principal',
  teacher: 'Teacher',
  parent: 'Parent',
  student: 'Student',
  accountant: 'Accountant',
  librarian: 'Librarian',
  transport_manager: 'Transport Manager',
  hostel_warden: 'Hostel Warden',
  receptionist: 'Receptionist',
};

export const ATTENDANCE_STATUSES = ['present', 'absent', 'late', 'excused', 'holiday'] as const;
export const PAYMENT_STATUSES = ['pending', 'partial', 'paid', 'overdue', 'cancelled'] as const;
export const ADMISSION_STATUSES = ['enquiry', 'applied', 'shortlisted', 'admitted', 'rejected', 'waitlisted'] as const;
export const GENDERS = ['male', 'female', 'other'] as const;
export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;