export interface FieldConfig {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'date' | 'dateonly' | 'select' | 'bool' | 'ref';
  options?: Array<{ label: string; value: string }>;
  ref?: { api: string; labelKey: string; secondaryKey?: string };
  required?: boolean;
  hint?: string;
}

/** A foreign-key field rendered as a dropdown loaded from another resource. */
function refField(
  key: string,
  label: string,
  api: string,
  labelKey: string,
  secondaryKey?: string,
  required = false
): FieldConfig {
  return { key, label, type: 'ref', ref: { api, labelKey, secondaryKey }, required };
}

export interface ColumnConfig {
  key: string;
  label: string;
  type: 'text' | 'date' | 'datetime' | 'number' | 'money' | 'badge' | 'bool';
  badgeMap?: Record<string, string>;
}

export interface ResourceConfig {
  key: string;
  label: string;
  api: string;
  columns: ColumnConfig[];
  fields: FieldConfig[];
  canCreate?: boolean;
  createLabel?: string;
}

const GENDER = [
  { label: 'Male', value: 'male' },
  { label: 'Female', value: 'female' },
  { label: 'Other', value: 'other' },
];

const BADGE_COMMON: Record<string, string> = {
  active: 'success', inactive: 'danger', pending: 'warning', approved: 'success',
  rejected: 'danger', paid: 'success', partial: 'warning', overdue: 'danger',
  cancelled: '', present: 'success', absent: 'danger', late: 'warning',
  complete: 'success', completed: 'success', draft: '',
  issued: 'success', returned: 'info', available: 'success', occupied: 'info',
  in_use: 'success', maintenance: 'warning',
};

const STATUS_OPTIONS = (list: string[]) => list.map((v) => ({ label: v.replace(/_/g, ' '), value: v }));

const idCol: ColumnConfig = { key: 'id', label: 'ID', type: 'number' };
const createdAtCol: ColumnConfig = { key: 'createdAt', label: 'Created', type: 'datetime' };
const statusCol = (map = BADGE_COMMON): ColumnConfig => ({ key: 'status', label: 'Status', type: 'badge', badgeMap: map });
const nameCol = (key = 'name', label = 'Name'): ColumnConfig => ({ key, label, type: 'text' });
const boolCol = (key: string, label: string): ColumnConfig => ({ key, label, type: 'bool' });

function fields(pairs: Array<Pick<FieldConfig, 'key' | 'label'> & Partial<FieldConfig>>): FieldConfig[] {
  return pairs.map((f) => ({
    type: 'text',
    ...f,
  }) as FieldConfig);
}

export const RESOURCE_CONFIGS: Record<string, ResourceConfig> = {
  roles: {
    key: 'roles', label: 'Roles', api: '/roles',
    columns: [nameCol('name', 'Role'), nameCol('label', 'Label'), { key: 'isSystem', label: 'System', type: 'bool' }],
    fields: fields([
      { key: 'name', label: 'Role name', required: true },
      { key: 'label', label: 'Display label' },
      { key: 'description', label: 'Description', type: 'textarea' },
    ]),
  },
  permissions: {
    key: 'permissions', label: 'Permissions', api: '/permissions',
    columns: [nameCol('key', 'Key'), nameCol('label', 'Label'), nameCol('category', 'Category')],
    fields: fields([{ key: 'key', label: 'Permission key', required: true }, { key: 'label', label: 'Label' }, { key: 'category', label: 'Category' }]),
  },
  branches: {
    key: 'branches', label: 'Branches', api: '/branches',
    columns: [nameCol('name', 'Branch'), nameCol('code', 'Code'), nameCol('city', 'City'), nameCol('phone', 'Phone'), boolCol('isActive', 'Active')],
    fields: fields([
      { key: 'name', label: 'Branch name', required: true },
      { key: 'code', label: 'Code' },
      { key: 'address', label: 'Address', type: 'textarea' },
      { key: 'city', label: 'City' }, { key: 'phone', label: 'Phone' }, { key: 'email', label: 'Email' },
    ]),
  },
  'academic-years': {
    key: 'academic-years', label: 'Academic Years', api: '/academic-years',
    columns: [nameCol('name', 'Year'), { key: 'startDate', label: 'Starts', type: 'date' }, { key: 'endDate', label: 'Ends', type: 'date' }, boolCol('isCurrent', 'Current')],
    fields: fields([
      { key: 'name', label: 'Name (e.g. 2025-2026)', required: true },
      { key: 'startDate', label: 'Start date', type: 'dateonly' },
      { key: 'endDate', label: 'End date', type: 'dateonly' },
      { key: 'isCurrent', label: 'Current year', type: 'bool' },
    ]),
  },
  terms: {
    key: 'terms', label: 'Terms', api: '/terms',
    columns: [nameCol('name', 'Term'), { key: 'startDate', label: 'Starts', type: 'date' }, { key: 'endDate', label: 'Ends', type: 'date' }, boolCol('isCurrent', 'Current')],
    fields: fields([refField('academicYearId', 'Academic year', '/academic-years', 'name', undefined, true), { key: 'name', label: 'Term name', required: true }, { key: 'startDate', label: 'Start', type: 'dateonly' }, { key: 'endDate', label: 'End', type: 'dateonly' }]),
  },
  classes: {
    key: 'classes', label: 'Classes', api: '/classes',
    columns: [nameCol('name', 'Class'), nameCol('level', 'Level'), { key: 'capacity', label: 'Capacity', type: 'number' }, { key: 'room', label: 'Room', type: 'text' }, boolCol('isActive', 'Active')],
    fields: fields([{ key: 'name', label: 'Class name', required: true }, { key: 'level', label: 'Level' }, { key: 'capacity', label: 'Capacity', type: 'number' }, { key: 'room', label: 'Room' }, { key: 'isActive', label: 'Active', type: 'bool' }]),
  },
  sections: {
    key: 'sections', label: 'Sections', api: '/sections',
    columns: [nameCol('name', 'Section'), { key: 'classId', label: 'Class ID', type: 'number' }, { key: 'capacity', label: 'Capacity', type: 'number' }, boolCol('isActive', 'Active')],
    fields: fields([refField('classId', 'Class', '/classes', 'name', undefined, true), { key: 'name', label: 'Section (A/B)', required: true }, { key: 'capacity', label: 'Capacity', type: 'number' }]),
  },
  subjects: {
    key: 'subjects', label: 'Subjects', api: '/subjects',
    columns: [nameCol('name'), nameCol('code', 'Code'), { key: 'maxMarks', label: 'Max Marks', type: 'number' }, { key: 'passMarks', label: 'Pass', type: 'number' }, boolCol('isActive', 'Active')],
    fields: fields([{ key: 'name', label: 'Subject name', required: true }, { key: 'code', label: 'Code' }, { key: 'maxMarks', label: 'Max marks', type: 'number' }, { key: 'passMarks', label: 'Pass marks', type: 'number' }, { key: 'isActive', label: 'Active', type: 'bool' }]),
  },
  enrolments: {
    key: 'enrolments', label: 'Enrolments', api: '/enrolments',
    columns: [{ key: 'studentId', label: 'Student', type: 'number' }, { key: 'classId', label: 'Class', type: 'number' }, { key: 'sectionId', label: 'Section', type: 'number' }, nameCol('rollNo', 'Roll No'), statusCol()],
    fields: fields([
      refField('studentId', 'Student', '/students', 'firstName', 'admissionNo', true),
      refField('academicYearId', 'Academic year', '/academic-years', 'name', undefined, true),
      refField('classId', 'Class', '/classes', 'name', undefined, true),
      refField('sectionId', 'Section', '/sections', 'name'),
      { key: 'rollNo', label: 'Roll number' },
      { key: 'status', label: 'Status', type: 'select', options: STATUS_OPTIONS(['active', 'promoted', 'graduated', 'transferred', 'withdrawn', 'expelled']) },
    ]),
  },
  parents: {
    key: 'parents', label: 'Parents', api: '/parents',
    columns: [nameCol('fullName', 'Name'), nameCol('relation'), nameCol('phone'), nameCol('email'), nameCol('occupation')],
    fields: fields([
      { key: 'fullName', label: 'Full name', required: true },
      { key: 'phone', label: 'Phone', required: true },
      { key: 'email', label: 'Email' },
      { key: 'relation', label: 'Relation', type: 'select', options: [{ label: 'Father', value: 'father' }, { label: 'Mother', value: 'mother' }, { label: 'Guardian', value: 'guardian' }] },
      { key: 'occupation', label: 'Occupation' },
    ]),
  },
  teachers: {
    key: 'teachers', label: 'Teachers', api: '/teachers',
    columns: [nameCol('staffNo', 'Staff No'), nameCol('firstName', 'First Name'), nameCol('lastName', 'Last Name'), nameCol('email'), nameCol('qualification'), boolCol('isActive', 'Active')],
    fields: fields([
      { key: 'staffNo', label: 'Staff number', required: true },
      { key: 'firstName', label: 'First name', required: true },
      { key: 'lastName', label: 'Last name' },
      { key: 'gender', label: 'Gender', type: 'select', options: GENDER },
      { key: 'phone', label: 'Phone' }, { key: 'email', label: 'Email' },
      { key: 'qualification', label: 'Qualification' },
      { key: 'specialization', label: 'Specialization' },
    ]),
  },
  staff: {
    key: 'staff', label: 'Staff', api: '/staff',
    columns: [nameCol('staffNo', 'Staff No'), nameCol('firstName', 'First Name'), nameCol('lastName', 'Last Name'), nameCol('department'), nameCol('designation'), boolCol('isActive', 'Active')],
    fields: fields([
      { key: 'staffNo', label: 'Staff number', required: true },
      { key: 'firstName', label: 'First name', required: true },
      { key: 'department', label: 'Department' },
      { key: 'designation', label: 'Designation' },
      { key: 'phone', label: 'Phone' }, { key: 'email', label: 'Email' },
    ]),
  },
  exams: {
    key: 'exams', label: 'Exams', api: '/exams',
    columns: [nameCol('name'), { key: 'examType', label: 'Type', type: 'badge' }, { key: 'startDate', label: 'Starts', type: 'date' }, { key: 'endDate', label: 'Ends', type: 'date' }, statusCol()],
    fields: fields([
      { key: 'name', label: 'Exam name', required: true },
      { key: 'examType', label: 'Type', type: 'select', options: STATUS_OPTIONS(['weekly', 'monthly', 'midterm', 'final', 'quiz']) },
      refField('academicYearId', 'Academic year', '/academic-years', 'name', undefined, true),
      { key: 'startDate', label: 'Start date', type: 'dateonly' },
      { key: 'endDate', label: 'End date', type: 'dateonly' },
      { key: 'maxMarks', label: 'Max marks', type: 'number' },
      { key: 'status', label: 'Status', type: 'select', options: STATUS_OPTIONS(['draft', 'published', 'completed', 'cancelled']) },
    ]),
  },
  'exam-results': {
    key: 'exam-results', label: 'Exam Results', api: '/exam-results',
    columns: [{ key: 'examId', label: 'Exam', type: 'number' }, { key: 'studentId', label: 'Student', type: 'number' }, { key: 'subjectId', label: 'Subject', type: 'number' }, { key: 'marksObtained', label: 'Marks', type: 'number' }, { key: 'grade', label: 'Grade', type: 'text' }],
    fields: fields([
      refField('examId', 'Exam', '/exams', 'name', undefined, true),
      refField('studentId', 'Student', '/students', 'firstName', 'admissionNo', true),
      refField('subjectId', 'Subject', '/subjects', 'name', undefined, true),
      { key: 'marksObtained', label: 'Marks obtained', type: 'number', required: true },
      { key: 'maxMarks', label: 'Max marks', type: 'number' },
      { key: 'remarks', label: 'Remarks', type: 'textarea' },
    ]),
  },
  'report-cards': {
    key: 'report-cards', label: 'Report Cards', api: '/report-cards',
    columns: [{ key: 'studentId', label: 'Student', type: 'number' }, { key: 'termId', label: 'Term', type: 'number' }, { key: 'percentage', label: '%', type: 'number' }, { key: 'grade', label: 'Grade', type: 'text' }, { key: 'rankInClass', label: 'Rank', type: 'number' }, boolCol('isPublished', 'Published')],
    fields: fields([refField('enrolmentId', 'Enrolment (student)', '/enrolments', 'studentId', undefined, true), refField('termId', 'Term', '/terms', 'name'), { key: 'teacherRemarks', label: 'Teacher remarks', type: 'textarea' }, { key: 'isPublished', label: 'Publish', type: 'bool' }]),
  },
  assignments: {
    key: 'assignments', label: 'Assignments / Homework', api: '/assignments',
    columns: [nameCol('title'), { key: 'classId', label: 'Class', type: 'number' }, { key: 'subjectId', label: 'Subject', type: 'number' }, { key: 'dueDate', label: 'Due', type: 'date' }, boolCol('isPublished', 'Published')],
    fields: fields([
      { key: 'title', label: 'Title', required: true },
      { key: 'description', label: 'Description', type: 'textarea' },
      { key: 'instructions', label: 'Instructions', type: 'textarea' },
      refField('classId', 'Class', '/classes', 'name', undefined, true),
      refField('subjectId', 'Subject', '/subjects', 'name'),
      { key: 'dueDate', label: 'Due date', type: 'dateonly' },
      { key: 'maxMarks', label: 'Max marks', type: 'number' },
    ]),
  },
  submissions: {
    key: 'submissions', label: 'Homework Submissions', api: '/submissions',
    columns: [{ key: 'assignmentId', label: 'Assignment', type: 'number' }, { key: 'studentId', label: 'Student', type: 'number' }, { key: 'marksAwarded', label: 'Marks', type: 'number' }, statusCol()],
    fields: fields([refField('assignmentId', 'Assignment', '/assignments', 'title', undefined, true), refField('studentId', 'Student', '/students', 'firstName', 'admissionNo', true), { key: 'content', label: 'Content', type: 'textarea' }, { key: 'status', label: 'Status', type: 'select', options: STATUS_OPTIONS(['submitted', 'graded', 'returned', 'late']) }]),
  },
  gradebook: {
    key: 'gradebook', label: 'Gradebook', api: '/gradebook',
    columns: [{ key: 'studentId', label: 'Student', type: 'number' }, { key: 'termId', label: 'Term', type: 'number' }, { key: 'subjectId', label: 'Subject', type: 'number' }, { key: 'total', label: 'Total', type: 'number' }, { key: 'grade', label: 'Grade', type: 'text' }],
    fields: fields([refField('studentId', 'Student', '/students', 'firstName', 'admissionNo', true), refField('termId', 'Term', '/terms', 'name', undefined, true), refField('subjectId', 'Subject', '/subjects', 'name', undefined, true), { key: 'continuousAvg', label: 'Continuous avg', type: 'number' }, { key: 'examScore', label: 'Exam score', type: 'number' }, { key: 'teacherComment', label: 'Comment' }]),
  },
  'grade-scales': {
    key: 'grade-scales', label: 'Grade Scales', api: '/grade-scales',
    columns: [nameCol('name'), { key: 'minPercentage', label: 'Min %', type: 'number' }, { key: 'maxPercentage', label: 'Max %', type: 'number' }, nameCol('grade', 'Grade'), nameCol('result', 'Result')],
    fields: fields([{ key: 'name', label: 'Name', required: true }, { key: 'grade', label: 'Grade', required: true }, { key: 'minPercentage', label: 'Min %', type: 'number', required: true }, { key: 'maxPercentage', label: 'Max %', type: 'number', required: true }, { key: 'result', label: 'Result', type: 'select', options: STATUS_OPTIONS(['PASS', 'FAIL']) }]),
  },
  timetable: {
    key: 'timetable', label: 'Timetables', api: '/timetable',
    columns: [nameCol('name'), { key: 'classId', label: 'Class', type: 'number' }, { key: 'sectionId', label: 'Section', type: 'number' }, { key: 'validFrom', label: 'Valid From', type: 'date' }, boolCol('isActive', 'Active')],
    fields: fields([{ key: 'name', label: 'Timetable name', required: true }, refField('classId', 'Class', '/classes', 'name', undefined, true), refField('sectionId', 'Section', '/sections', 'name'), { key: 'validFrom', label: 'Valid from', type: 'dateonly' }, { key: 'validTo', label: 'Valid to', type: 'dateonly' }]),
  },
  periods: {
    key: 'periods', label: 'Periods', api: '/periods',
    columns: [{ key: 'classId', label: 'Class', type: 'number' }, { key: 'sectionId', label: 'Section', type: 'number' }, nameCol('dayOfWeek', 'Day'), nameCol('startTime', 'Start'), nameCol('endTime', 'End'), nameCol('room', 'Room')],
    fields: fields([refField('classId', 'Class', '/classes', 'name', undefined, true), refField('sectionId', 'Section', '/sections', 'name'), { key: 'dayOfWeek', label: 'Day', type: 'select', options: STATUS_OPTIONS(['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']), required: true }, { key: 'startTime', label: 'Start time', required: true }, { key: 'endTime', label: 'End time', required: true }, refField('subjectId', 'Subject', '/subjects', 'name'), { key: 'room', label: 'Room' }]),
  },
  'fee-types': {
    key: 'fee-types', label: 'Fee Types', api: '/fee-types',
    columns: [nameCol('name'), nameCol('category'), { key: 'amount', label: 'Amount', type: 'money' }, nameCol('billingCycle', 'Cycle'), boolCol('isActive', 'Active')],
    fields: fields([{ key: 'name', label: 'Fee name', required: true }, { key: 'category', label: 'Category', type: 'select', options: STATUS_OPTIONS(['tuition', 'transport', 'hostel', 'misc']) }, { key: 'amount', label: 'Amount', type: 'number', required: true }, { key: 'billingCycle', label: 'Billing cycle', type: 'select', options: STATUS_OPTIONS(['term', 'monthly', 'yearly', 'one-time']) }, { key: 'isMandatory', label: 'Mandatory', type: 'bool' }, { key: 'isActive', label: 'Active', type: 'bool' }]),
  },
  expenses: {
    key: 'expenses', label: 'Expenses', api: '/expenses',
    columns: [nameCol('title'), nameCol('category'), { key: 'amount', label: 'Amount', type: 'money' }, { key: 'expensedOn', label: 'Date', type: 'date' }, statusCol()],
    fields: fields([{ key: 'title', label: 'Title', required: true }, { key: 'category', label: 'Category', required: true }, { key: 'amount', label: 'Amount', type: 'number', required: true }, { key: 'expensedOn', label: 'Date', type: 'dateonly' }, { key: 'notes', label: 'Notes', type: 'textarea' }]),
  },
  payroll: {
    key: 'payroll', label: 'Payroll', api: '/payroll',
    columns: [nameCol('month'), nameCol('payeeType', 'Payee Type'), { key: 'basicSalary', label: 'Basic', type: 'money' }, { key: 'netPay', label: 'Net Pay', type: 'money' }, statusCol()],
    fields: fields([{ key: 'month', label: 'Month (YYYY-MM)', required: true }, { key: 'payeeType', label: 'Payee type', type: 'select', options: STATUS_OPTIONS(['teacher', 'staff']) }, refField('teacherId', 'Teacher', '/teachers', 'firstName', 'staffNo'), refField('staffId', 'Staff', '/staff', 'firstName', 'staffNo'), { key: 'basicSalary', label: 'Basic salary', type: 'number', required: true }, { key: 'allowances', label: 'Allowances', type: 'number' }, { key: 'deductions', label: 'Deductions', type: 'number' }, { key: 'status', label: 'Status', type: 'select', options: STATUS_OPTIONS(['draft', 'approved', 'paid']) }]),
  },
  payslips: {
    key: 'payslips', label: 'Payslips', api: '/payslips',
    columns: [nameCol('payslipNo', 'Payslip No'), { key: 'payrollItemId', label: 'Payroll Item', type: 'number' }, { key: 'gross', label: 'Gross', type: 'money' }, { key: 'net', label: 'Net', type: 'money' }],
    fields: fields([{ key: 'payslipNo', label: 'Payslip number', required: true }, refField('payrollItemId', 'Payroll item', '/payroll', 'month', undefined, true), { key: 'notes', label: 'Notes', type: 'textarea' }]),
  },
  leaves: {
    key: 'leaves', label: 'Leave Requests', api: '/leaves',
    columns: [{ key: 'userId', label: 'User', type: 'number' }, nameCol('leaveType', 'Type'), { key: 'startDate', label: 'From', type: 'date' }, { key: 'endDate', label: 'To', type: 'date' }, statusCol()],
    fields: fields([{ key: 'leaveType', label: 'Leave type', type: 'select', options: STATUS_OPTIONS(['sick', 'casual', 'annual', 'unpaid', 'maternity']), required: true }, { key: 'startDate', label: 'Start date', type: 'dateonly', required: true }, { key: 'endDate', label: 'End date', type: 'dateonly', required: true }, { key: 'reason', label: 'Reason', type: 'textarea' }, { key: 'status', label: 'Status', type: 'select', options: STATUS_OPTIONS(['pending', 'approved', 'rejected', 'cancelled']) }]),
  },
  books: {
    key: 'books', label: 'Books', api: '/books',
    columns: [nameCol('title'), nameCol('author'), nameCol('isbn'), nameCol('category'), { key: 'copies', label: 'Copies', type: 'number' }, boolCol('isActive', 'Active')],
    fields: fields([
      { key: 'isbn', label: 'ISBN', required: true },
      { key: 'title', label: 'Title', required: true },
      { key: 'author', label: 'Author' }, { key: 'publisher', label: 'Publisher' },
      { key: 'publishedYear', label: 'Year', type: 'number' },
      { key: 'category', label: 'Category' },
      { key: 'copies', label: 'Copies', type: 'number' },
      { key: 'shelfLocation', label: 'Shelf location' },
    ]),
  },
  'book-copies': {
    key: 'book-copies', label: 'Book Copies', api: '/book-copies',
    columns: [nameCol('accessionNo', 'Accession No'), { key: 'bookId', label: 'Book', type: 'number' }, statusCol()],
    fields: fields([{ key: 'accessionNo', label: 'Accession number', required: true }, refField('bookId', 'Book', '/books', 'title', undefined, true)]),
  },
  'book-fines': {
    key: 'book-fines', label: 'Book Fines', api: '/book-fines',
    columns: [{ key: 'bookIssueId', label: 'Issue', type: 'number' }, { key: 'userId', label: 'User', type: 'number' }, { key: 'amount', label: 'Amount', type: 'money' }, statusCol()],
    fields: fields([refField('bookIssueId', 'Book issue', '/book-issues', 'id', undefined, true), refField('userId', 'User', '/users', 'firstName', 'email', true), { key: 'amount', label: 'Amount', type: 'number', required: true }, { key: 'reason', label: 'Reason' }]),
  },
  routes: {
    key: 'routes', label: 'Transport Routes', api: '/routes',
    columns: [nameCol('name'), nameCol('startPoint', 'Start'), nameCol('endPoint', 'End'), { key: 'monthlyFee', label: 'Fee', type: 'money' }, boolCol('isActive', 'Active')],
    fields: fields([{ key: 'name', label: 'Route name', required: true }, { key: 'startPoint', label: 'Start point' }, { key: 'endPoint', label: 'End point' }, { key: 'monthlyFee', label: 'Monthly fee', type: 'number' }, { key: 'description', label: 'Description', type: 'textarea' }]),
  },
  'route-stops': {
    key: 'route-stops', label: 'Route Stops', api: '/route-stops',
    columns: [{ key: 'routeId', label: 'Route', type: 'number' }, nameCol('name'), { key: 'orderIndex', label: 'Order', type: 'number' }, nameCol('pickupTime', 'Pickup'), { key: 'stopFee', label: 'Fee', type: 'money' }],
    fields: fields([refField('routeId', 'Route', '/routes', 'name', undefined, true), { key: 'name', label: 'Stop name', required: true }, { key: 'orderIndex', label: 'Order', type: 'number', required: true }, { key: 'pickupTime', label: 'Pickup time' }, { key: 'dropTime', label: 'Drop time' }, { key: 'stopFee', label: 'Stop fee', type: 'number' }]),
  },
  vehicles: {
    key: 'vehicles', label: 'Vehicles', api: '/vehicles',
    columns: [nameCol('registrationNo', 'Reg No'), nameCol('model'), { key: 'capacity', label: 'Capacity', type: 'number' }, nameCol('fuelType', 'Fuel'), statusCol()],
    fields: fields([{ key: 'registrationNo', label: 'Registration number', required: true }, { key: 'model', label: 'Model' }, { key: 'capacity', label: 'Capacity', type: 'number' }, { key: 'fuelType', label: 'Fuel type', type: 'select', options: STATUS_OPTIONS(['petrol', 'diesel', 'cng', 'electric']) }, { key: 'insuranceExpiry', label: 'Insurance expiry', type: 'dateonly' }, { key: 'fitnessExpiry', label: 'Fitness expiry', type: 'dateonly' }]),
  },
  'student-transport': {
    key: 'student-transport', label: 'Student Transport', api: '/student-transport',
    columns: [{ key: 'studentId', label: 'Student', type: 'number' }, { key: 'routeId', label: 'Route', type: 'number' }, { key: 'stopId', label: 'Stop', type: 'number' }, { key: 'vehicleId', label: 'Vehicle', type: 'number' }, boolCol('isActive', 'Active')],
    fields: fields([refField('studentId', 'Student', '/students', 'firstName', 'admissionNo', true), refField('routeId', 'Route', '/routes', 'name', undefined, true), refField('stopId', 'Stop', '/route-stops', 'name'), refField('vehicleId', 'Vehicle', '/vehicles', 'registrationNo'), { key: 'startDate', label: 'Start date', type: 'dateonly' }, { key: 'endDate', label: 'End date', type: 'dateonly' }]),
  },
  hostels: {
    key: 'hostels', label: 'Hostels', api: '/hostels',
    columns: [nameCol('name'), nameCol('gender'), { key: 'capacity', label: 'Capacity', type: 'number' }, nameCol('wardenName', 'Warden'), boolCol('isActive', 'Active')],
    fields: fields([{ key: 'name', label: 'Hostel name', required: true }, { key: 'gender', label: 'Type', type: 'select', options: STATUS_OPTIONS(['boys', 'girls', 'coed']) }, { key: 'capacity', label: 'Capacity', type: 'number' }, { key: 'wardenName', label: 'Warden' }, { key: 'address', label: 'Address', type: 'textarea' }]),
  },
  rooms: {
    key: 'rooms', label: 'Rooms', api: '/rooms',
    columns: [{ key: 'hostelId', label: 'Hostel', type: 'number' }, nameCol('roomNo', 'Room'), { key: 'capacity', label: 'Capacity', type: 'number' }, nameCol('floor'), statusCol()],
    fields: fields([refField('hostelId', 'Hostel', '/hostels', 'name', undefined, true), { key: 'roomNo', label: 'Room number', required: true }, { key: 'capacity', label: 'Capacity', type: 'number' }, { key: 'floor', label: 'Floor' }]),
  },
  beds: {
    key: 'beds', label: 'Beds', api: '/beds',
    columns: [{ key: 'roomId', label: 'Room', type: 'number' }, nameCol('bedNo', 'Bed'), statusCol()],
    fields: fields([refField('roomId', 'Room', '/rooms', 'roomNo', undefined, true), { key: 'bedNo', label: 'Bed number', required: true }]),
  },
  'hostel-allocations': {
    key: 'hostel-allocations', label: 'Hostel Allocations', api: '/hostel-allocations',
    columns: [{ key: 'studentId', label: 'Student', type: 'number' }, { key: 'hostelId', label: 'Hostel', type: 'number' }, { key: 'roomId', label: 'Room', type: 'number' }, { key: 'bedId', label: 'Bed', type: 'number' }, { key: 'checkIn', label: 'Check-in', type: 'date' }, statusCol()],
    fields: fields([refField('studentId', 'Student', '/students', 'firstName', 'admissionNo', true), refField('bedId', 'Bed', '/beds', 'bedNo', undefined, true), { key: 'checkIn', label: 'Check-in', type: 'dateonly' }, { key: 'monthlyFee', label: 'Monthly fee', type: 'number' }]),
  },
  events: {
    key: 'events', label: 'Events', api: '/events',
    columns: [nameCol('title'), nameCol('category'), { key: 'startAt', label: 'Starts', type: 'datetime' }, nameCol('venue'), boolCol('isPublic', 'Public')],
    fields: fields([{ key: 'title', label: 'Title', required: true }, { key: 'description', label: 'Description', type: 'textarea' }, { key: 'category', label: 'Category', type: 'select', options: STATUS_OPTIONS(['general', 'sports', 'cultural', 'exam', 'holiday']) }, { key: 'startAt', label: 'Start', type: 'dateonly', required: true }, { key: 'endAt', label: 'End', type: 'dateonly' }, { key: 'venue', label: 'Venue' }, { key: 'allDay', label: 'All day', type: 'bool' }, { key: 'isPublic', label: 'Public', type: 'bool' }]),
  },
  notices: {
    key: 'notices', label: 'Notices', api: '/notices',
    columns: [nameCol('title'), nameCol('type'), { key: 'publishDate', label: 'Published', type: 'date' }, { key: 'expiryDate', label: 'Expires', type: 'date' }, boolCol('isPublished', 'Published')],
    fields: fields([{ key: 'title', label: 'Title', required: true }, { key: 'body', label: 'Body', type: 'textarea', required: true }, { key: 'type', label: 'Type', type: 'select', options: STATUS_OPTIONS(['notice', 'circular', 'urgent']) }, { key: 'publishDate', label: 'Publish date', type: 'dateonly' }, { key: 'expiryDate', label: 'Expiry date', type: 'dateonly' }]),
  },
  announcements: {
    key: 'announcements', label: 'Announcements', api: '/announcements',
    columns: [nameCol('title'), nameCol('priority'), { key: 'startsAt', label: 'Starts', type: 'datetime' }, { key: 'endsAt', label: 'Ends', type: 'datetime' }, boolCol('isPinned', 'Pinned')],
    fields: fields([{ key: 'title', label: 'Title', required: true }, { key: 'body', label: 'Body', type: 'textarea' }, { key: 'priority', label: 'Priority', type: 'select', options: STATUS_OPTIONS(['info', 'important', 'critical']) }, { key: 'startsAt', label: 'Starts at', type: 'dateonly', required: true }, { key: 'endsAt', label: 'Ends at', type: 'dateonly' }, { key: 'isPinned', label: 'Pinned', type: 'bool' }]),
  },
  messages: {
    key: 'messages', label: 'Messages', api: '/messages',
    columns: [nameCol('subject'), { key: 'senderId', label: 'Sender', type: 'number' }, nameCol('kind'), boolCol('isArchived', 'Archived')],
    fields: fields([{ key: 'subject', label: 'Subject' }, { key: 'body', label: 'Message', type: 'textarea', required: true }, { key: 'kind', label: 'Kind', type: 'select', options: STATUS_OPTIONS(['direct', 'broadcast', 'group']) }]),
  },
  notifications: {
    key: 'notifications', label: 'Notifications', api: '/notifications',
    columns: [{ key: 'userId', label: 'User', type: 'number' }, nameCol('channel'), nameCol('title'), { key: 'readAt', label: 'Read', type: 'datetime' }],
    fields: [],
    canCreate: false,
  },
  syllabus: {
    key: 'syllabus', label: 'Syllabus', api: '/syllabus',
    columns: [nameCol('title'), { key: 'classId', label: 'Class', type: 'number' }, { key: 'subjectId', label: 'Subject', type: 'number' }, { key: 'publishedAt', label: 'Published', type: 'date' }, boolCol('isPublished', 'Published')],
    fields: fields([{ key: 'title', label: 'Title', required: true }, refField('classId', 'Class', '/classes', 'name', undefined, true), refField('subjectId', 'Subject', '/subjects', 'name'), { key: 'description', label: 'Description', type: 'textarea' }, { key: 'resourceFile', label: 'Resource file' }]),
  },
  'lesson-plans': {
    key: 'lesson-plans', label: 'Lesson Plans', api: '/lesson-plans',
    columns: [nameCol('title'), { key: 'classId', label: 'Class', type: 'number' }, { key: 'subjectId', label: 'Subject', type: 'number' }, { key: 'plannedDate', label: 'Planned', type: 'date' }, boolCol('isCompleted', 'Done')],
    fields: fields([{ key: 'title', label: 'Title', required: true }, refField('subjectId', 'Subject', '/subjects', 'name'), refField('classId', 'Class', '/classes', 'name'), { key: 'objectives', label: 'Objectives', type: 'textarea' }, { key: 'materials', label: 'Materials', type: 'textarea' }, { key: 'plannedDate', label: 'Planned date', type: 'dateonly' }, { key: 'isCompleted', label: 'Completed', type: 'bool' }]),
  },
  'health-records': {
    key: 'health-records', label: 'Health Records', api: '/health-records',
    columns: [{ key: 'studentId', label: 'Student', type: 'number' }, nameCol('bloodGroup', 'Blood'), nameCol('medicalConditions', 'Conditions'), { key: 'lastCheckup', label: 'Last Checkup', type: 'date' }],
    fields: fields([refField('studentId', 'Student', '/students', 'firstName', 'admissionNo', true), { key: 'bloodGroup', label: 'Blood group', type: 'select', options: STATUS_OPTIONS(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']) }, { key: 'medicalConditions', label: 'Conditions' }, { key: 'insuranceNumber', label: 'Insurance no' }, { key: 'lastCheckup', label: 'Last checkup', type: 'dateonly' }]),
    canCreate: false,
  },
  'discipline-records': {
    key: 'discipline-records', label: 'Discipline', api: '/discipline-records',
    columns: [{ key: 'studentId', label: 'Student', type: 'number' }, nameCol('type'), nameCol('title'), { key: 'recordedOn', label: 'Date', type: 'date' }, statusCol()],
    fields: fields([refField('studentId', 'Student', '/students', 'firstName', 'admissionNo', true), { key: 'type', label: 'Type', type: 'select', options: STATUS_OPTIONS(['warning', 'detention', 'suspension', 'praise']), required: true }, { key: 'title', label: 'Title', required: true }, { key: 'description', label: 'Description', type: 'textarea' }, { key: 'recordedOn', label: 'Recorded on', type: 'dateonly', required: true }, { key: 'actionTaken', label: 'Action taken' }]),
  },
  inventory: {
    key: 'inventory', label: 'Inventory', api: '/inventory',
    columns: [nameCol('name'), nameCol('category'), nameCol('sku'), { key: 'quantity', label: 'Qty', type: 'number' }, { key: 'minQuantity', label: 'Min', type: 'number' }, boolCol('isActive', 'Active')],
    fields: fields([{ key: 'name', label: 'Item name', required: true }, { key: 'category', label: 'Category' }, { key: 'sku', label: 'SKU' }, { key: 'quantity', label: 'Quantity', type: 'number' }, { key: 'minQuantity', label: 'Min quantity', type: 'number' }, { key: 'unit', label: 'Unit' }, { key: 'unitPrice', label: 'Unit price', type: 'number' }, { key: 'supplier', label: 'Supplier' }]),
  },
  assets: {
    key: 'assets', label: 'Assets', api: '/assets',
    columns: [nameCol('assetCode', 'Code'), nameCol('name'), nameCol('category'), { key: 'purchasePrice', label: 'Price', type: 'money' }, nameCol('location'), statusCol()],
    fields: fields([{ key: 'assetCode', label: 'Asset code', required: true }, { key: 'name', label: 'Name', required: true }, { key: 'category', label: 'Category' }, { key: 'purchaseDate', label: 'Purchase date', type: 'dateonly' }, { key: 'purchasePrice', label: 'Purchase price', type: 'number' }, { key: 'location', label: 'Location' }, { key: 'status', label: 'Status', type: 'select', options: STATUS_OPTIONS(['in_use', 'stored', 'maintenance', 'scrapped']) }]),
  },
  'audit-logs': {
    key: 'audit-logs', label: 'Audit Logs', api: '/audit-logs',
    columns: [{ key: 'userId', label: 'User', type: 'number' }, nameCol('action'), nameCol('entity'), nameCol('entityId', 'Entity ID'), { key: 'createdAt', label: 'Time', type: 'datetime' }],
    fields: [],
    canCreate: false,
  },
  'visitor-logs': {
    key: 'visitor-logs', label: 'Visitor Logs', api: '/visitor-logs',
    columns: [nameCol('visitorName', 'Visitor'), nameCol('phone'), nameCol('purpose'), nameCol('personToSee', 'To See'), { key: 'checkedIn', label: 'In', type: 'datetime' }, { key: 'checkedOut', label: 'Out', type: 'datetime' }],
    fields: fields([{ key: 'visitorName', label: 'Visitor name', required: true }, { key: 'phone', label: 'Phone' }, { key: 'purpose', label: 'Purpose' }, { key: 'personToSee', label: 'Person to see' }, { key: 'checkedIn', label: 'Checked in', type: 'dateonly', required: true }, { key: 'notes', label: 'Notes', type: 'textarea' }]),
  },
  'class-subjects': {
    key: 'class-subjects', label: 'Class Subjects', api: '/class-subjects',
    columns: [{ key: 'classId', label: 'Class', type: 'number' }, { key: 'subjectId', label: 'Subject', type: 'number' }],
    fields: fields([refField('classId', 'Class', '/classes', 'name', undefined, true), refField('subjectId', 'Subject', '/subjects', 'name', undefined, true)]),
  },
  'exam-schedules': {
    key: 'exam-schedules', label: 'Exam Schedules', api: '/exam-schedules',
    columns: [{ key: 'examId', label: 'Exam', type: 'number' }, { key: 'classId', label: 'Class', type: 'number' }, { key: 'subjectId', label: 'Subject', type: 'number' }, { key: 'date', label: 'Date', type: 'date' }, nameCol('startTime', 'Start'), nameCol('room', 'Room')],
    fields: fields([refField('examId', 'Exam', '/exams', 'name', undefined, true), refField('classId', 'Class', '/classes', 'name'), refField('subjectId', 'Subject', '/subjects', 'name'), { key: 'date', label: 'Exam date', type: 'dateonly' }, { key: 'startTime', label: 'Start time' }, { key: 'endTime', label: 'End time' }, { key: 'room', label: 'Room' }]),
  },
  students: {
    key: 'students', label: 'Students', api: '/students',
    columns: [nameCol('admissionNo', 'Admission No'), nameCol('firstName', 'First'), nameCol('lastName', 'Last'), nameCol('guardianPhone', 'Guardian Phone'), { key: 'currentClassId', label: 'Class', type: 'number' }, { key: 'admissionStatus', label: 'Status', type: 'badge', badgeMap: BADGE_COMMON }],
    fields: fields([
      { key: 'admissionNo', label: 'Admission number', required: true },
      { key: 'firstName', label: 'First name', required: true },
      { key: 'lastName', label: 'Last name' },
      { key: 'gender', label: 'Gender', type: 'select', options: GENDER },
      { key: 'dateOfBirth', label: 'Date of birth', type: 'dateonly' },
      { key: 'guardianName', label: 'Guardian name' },
      { key: 'guardianPhone', label: 'Guardian phone' },
      refField('currentClassId', 'Class', '/classes', 'name'),
      refField('currentSectionId', 'Section', '/sections', 'name'),
    ]),
  },
  'book-issues': {
    key: 'book-issues', label: 'Book Issues', api: '/book-issues',
    columns: [{ key: 'bookCopyId', label: 'Copy', type: 'number' }, { key: 'userId', label: 'Borrower', type: 'number' }, { key: 'issueDate', label: 'Issued', type: 'date' }, { key: 'dueDate', label: 'Due', type: 'date' }, statusCol()],
    fields: fields([
      refField('bookCopyId', 'Book copy', '/book-copies', 'accessionNo', undefined, true),
      refField('studentId', 'Student', '/students', 'firstName', 'admissionNo', true),
      { key: 'dueInDays', label: 'Due in (days)', type: 'number' },
      { key: 'requestedFor', label: 'Requested for', type: 'select', options: STATUS_OPTIONS(['student', 'teacher', 'staff']) },
    ]),
  },
  payments: {
    key: 'payments', label: 'Payments', api: '/payments',
    columns: [{ key: 'invoiceId', label: 'Invoice', type: 'number' }, { key: 'method', label: 'Method', type: 'text' }, { key: 'reference', label: 'Reference', type: 'text' }, { key: 'amount', label: 'Amount', type: 'money' }, { key: 'paidOn', label: 'Paid', type: 'datetime' }, statusCol()],
    fields: [],
    canCreate: false,
  },
  certificates: {
    key: 'certificates', label: 'Certificates', api: '/certificates',
    columns: [nameCol('certNo', 'Cert No'), { key: 'studentId', label: 'Student', type: 'number' }, { key: 'type', label: 'Type', type: 'badge', badgeMap: BADGE_COMMON }, { key: 'issuedOn', label: 'Issued', type: 'date' }, boolCol('isVerified', 'Verified')],
    fields: fields([{ key: 'type', label: 'Type', type: 'select', options: STATUS_OPTIONS(['transfer', 'character', 'bonafide', 'provisional', 'mark_sheet']), required: true }, refField('studentId', 'Student', '/students', 'firstName', 'admissionNo', true), { key: 'title', label: 'Title' }, { key: 'body', label: 'Body', type: 'textarea' }]),
  },
  complaints: {
    key: 'complaints', label: 'Complaints', api: '/complaints',
    columns: [nameCol('title'), { key: 'priority', label: 'Priority', type: 'badge', badgeMap: BADGE_COMMON }, nameCol('category'), { key: 'assignedTo', label: 'Assigned To', type: 'number' }, statusCol()],
    fields: fields([{ key: 'title', label: 'Title', required: true }, { key: 'description', label: 'Details', type: 'textarea', required: true }, { key: 'category', label: 'Category', type: 'select', options: STATUS_OPTIONS(['academic', 'facility', 'staff', 'transport', 'other']), required: true }, { key: 'priority', label: 'Priority', type: 'select', options: STATUS_OPTIONS(['high', 'medium', 'low']) }, { key: 'status', label: 'Status', type: 'select', options: STATUS_OPTIONS(['open', 'in_progress', 'resolved', 'closed']) }, refField('assignedTo', 'Assigned to', '/users', 'firstName', 'email')]),
  },
  media: {
    key: 'media', label: 'Media', api: '/media',
    columns: [nameCol('filename', 'File'), nameCol('mimeType', 'Type'), { key: 'size', label: 'Size bytes', type: 'number' }, nameCol('category', 'Category'), { key: 'createdAt', label: 'Uploaded', type: 'datetime' }],
    fields: [],
    canCreate: false,
  },
};

export const RESOURCE_KEYS = Object.keys(RESOURCE_CONFIGS);

export function resolveResource(key: string): ResourceConfig | null {
  return RESOURCE_CONFIGS[key] ?? null;
}

export { idCol, createdAtCol, boolCol };