import { hashPassword } from "../../utils/password.util";
import {
  User, Role, Permission, Branch, AcademicYear, Term, SchoolClass, Section,
  Subject, FeeType, GradeScale, Settings,
} from "../../models";
import { logger } from "../../config/logger";

const ROLES = [
  "super_admin", "admin", "principal", "teacher", "parent", "student",
  "accountant", "librarian", "transport_manager", "hostel_warden", "receptionist",
];

const PERMISSIONS = [
  "dashboard:read", "students:read", "students:create", "students:update", "students:delete",
  "teachers:read", "teachers:create", "teachers:update", "staff:read", "classes:read",
  "sections:read", "subjects:read", "attendance:read", "attendance:create", "attendance:update",
  "exams:read", "exams:create", "exams:update", "exam-results:read", "exam-results:create",
  "exam-results:update", "report-cards:read", "assignments:read", "assignments:create",
  "assignments:update", "submissions:read", "submissions:update", "gradebook:read",
  "gradebook:update", "timetable:read", "timetable:create", "fees:read", "fees:create",
  "invoices:read", "invoices:create", "invoices:update", "invoices:delete", "payments:read",
  "payments:create", "receipts:read", "receipts:create", "refunds:create", "expenses:read",
  "expenses:create", "expenses:update", "payroll:read", "payroll:create", "leaves:read",
  "leaves:create", "leaves:update", "library:read", "library:create", "book-issues:read",
  "book-issues:create", "book-issues:update", "book-fines:read", "book-fines:create",
  "routes:read", "routes:create", "routes:update", "vehicles:read", "vehicles:create",
  "hostels:read", "hostels:create", "hostels:update", "rooms:read", "rooms:create",
  "beds:read", "beds:update", "hostel-allocations:read", "hostel-allocations:create",
  "hostel-allocations:update", "events:read", "events:create", "notices:read", "notices:create",
  "announcements:create", "messages:read", "messages:send", "notifications:read", "syllabus:read",
  "syllabus:create", "lesson-plans:read", "lesson-plans:create", "certificates:read",
  "certificates:create", "certificates:update", "certificates:delete", "health-records:read",
  "discipline-records:read", "discipline-records:create", "complaints:read", "complaints:create",
  "complaints:update", "inventory:read", "inventory:create", "inventory:update", "audit-logs:read",
  "settings:manage", "reports:read", "reports:export", "users:read", "users:create",
  "users:update", "users:delete", "roles:read", "roles:create", "roles:delete",
  "permissions:read", "permissions:create", "permissions:delete", "branches:read",
  "branches:create", "media:read", "media:create", "media:delete", "admissions:read",
  "admissions:create", "admissions:update", "visitors:create",
];

export async function runSeeders(): Promise<void> {
  const isSeeded = await Settings.findOne({ where: { scope: "system", key: "seeded" } });
  if (isSeeded?.value === "true") {
    logger.info("Seeders: already seeded, skipping");
    return;
  }

  logger.info("Seeders: beginning...");

  // Roles
  for (const r of ROLES) {
    await Role.upsert({ name: r, label: r.replace("_", " "), isSystem: true });
  }

  // Permissions
  for (const p of PERMISSIONS) {
    await Permission.upsert({ key: p, label: p, category: p.split(":")[0] });
  }

  // Default branches
  const [branch] = await Branch.upsert({
    name: "Default Campus",
    code: "MAIN",
    city: "City",
    country: "US",
    isActive: true,
  });

  // Academic year + terms
  const yearName = `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`;
  const [year] = await AcademicYear.findOrCreate({
    where: { name: yearName },
    defaults: { name: yearName, startDate: new Date(), endDate: new Date(new Date().getFullYear() + 1, 5, 30), isCurrent: true },
  });
  for (let t = 0; t < 3; t++) {
    await Term.findOrCreate({
      where: { academicYearId: year.id, name: `Term ${t + 1}` },
      defaults: { academicYearId: year.id, name: `Term ${t + 1}`, isCurrent: t === 0 },
    });
  }

  // Classes + sections
  const classNames = ["Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6", "Grade 7", "Grade 8", "Grade 9", "Grade 10"];
  for (const name of classNames) {
    const [klass] = await SchoolClass.findOrCreate({ where: { name }, defaults: { name, branchId: branch.id, isActive: true, capacity: 40 } });
    for (const sec of ["A", "B"]) {
      await Section.findOrCreate({ where: { classId: klass.id, name: sec }, defaults: { classId: klass.id, name: sec, capacity: 20 } });
    }
  }

  // Subjects
  const subjects = ["Mathematics", "English", "Physics", "Chemistry", "Biology", "History", "Geography", "Computer Science", "Physical Education", "Art"];
  for (let i = 0; i < subjects.length; i++) {
    await Subject.findOrCreate({
      where: { name: subjects[i] },
      defaults: { name: subjects[i], code: `SUB${String(i + 1).padStart(2, "0")}`, maxMarks: 100, passMarks: 35 },
    });
  }

  // Grade scale
  const scale = [
    ["A+", 90, 100, "DISTINCTION"], ["A", 80, 89, "EXCELLENT"], ["B+", 70, 79, "VERY GOOD"],
    ["B", 60, 69, "GOOD"], ["C", 50, 59, "AVERAGE"], ["D", 40, 49, "PASS"], ["F", 0, 39, "FAIL"],
  ];
  for (const [grade, from, to, result] of scale) {
    await GradeScale.upsert({
      name: `Grade ${grade}`,
      grade: grade as string,
      minPercentage: from as number,
      maxPercentage: to as number,
      result: result as string,
    });
  }

  // Fee types
  await FeeType.bulkCreate([
    { name: "Tuition Fee", category: "tuition", amount: 2500, installments: 1, billingCycle: "term", isMandatory: true },
    { name: "Transport Fee", category: "transport", amount: 800, installments: 1, billingCycle: "term", isMandatory: false },
    { name: "Hostel Fee", category: "hostel", amount: 1500, installments: 1, billingCycle: "term", isMandatory: false },
    { name: "Library Fee", category: "misc", amount: 200, installments: 1, billingCycle: "term", isMandatory: false },
  ], { ignoreDuplicates: true });

  // Super admin account
  const admin = await User.findOrCreate({
    where: { email: "admin@school.local" },
    defaults: {
      username: "superadmin",
      email: "admin@school.local",
      firstName: "Super",
      lastName: "Admin",
      role: "super_admin",
      passwordHash: await hashPassword("Admin@123"),
      emailVerified: true,
      isActive: true,
      branchId: branch.id,
    },
  });

  // Lock-in the seed markers
  await Settings.upsert({ scope: "system", key: "seeded", value: "true", description: "seed ran" });
  await Settings.upsert({ scope: "system", key: "schoolName", value: "Enterprise School", isPublic: true });
  await Settings.upsert({ scope: "system", key: "contactEmail", value: "office@school.local", isPublic: true });

  logger.info(`Seeders: done. Super admin -> admin@school.local / Admin@123 (id=${admin[0].id})`);
}