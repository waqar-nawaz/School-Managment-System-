import crypto from "crypto";
import { hashPassword } from "../../utils/password.util";
import {
  User, Role, Permission, Branch, AcademicYear, Term, SchoolClass, Section,
  Subject, FeeType, GradeScale, Settings,
} from "../../models";
import { logger } from "../../config/logger";

const ROLES = [
  "super_admin", "admin", "principal", "teacher", "parent", "student",
  "accountant", "librarian", "transport_manager", "hostel_warden", "receptionist", "staff",
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
  "leaves:create", "leaves:update", "leaves:approve", "library:read", "library:create", "book-issues:read",
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

/** Seed password: env override -> random in production -> documented default only in dev. */
function seedAdminPassword(): { password: string; generated: boolean } {
  const fromEnv = process.env.SEED_ADMIN_PASSWORD;
  if (fromEnv) return { password: fromEnv, generated: false };
  if (process.env.NODE_ENV === "production") {
    // Never ship a well-known default credential to production.
    return { password: crypto.randomBytes(12).toString("base64url") + "#1aA", generated: true };
  }
  return { password: "Admin@123", generated: false };
}

export async function runSeeders(): Promise<void> {
  const isSeeded = await Settings.findOne({ where: { scope: "system", key: "seeded" } });
  if (isSeeded?.value === "true") {
    logger.info("Seeders: already seeded, skipping");
    return;
  }

  logger.info("Seeders: beginning...");

  // Roles
  for (const r of ROLES) {
    await Role.upsert({ name: r, label: r.replace(/_/g, " "), isSystem: true });
  }

  // Permissions
  for (const p of PERMISSIONS) {
    await Permission.upsert({ key: p, label: p, category: p.split(":")[0] });
  }

  // Default branch. findOrCreate (not upsert) so we always get a real row + id on every dialect.
  const [branch] = await Branch.findOrCreate({
    where: { name: "Default Campus" },
    defaults: { name: "Default Campus", code: "MAIN", city: "City", country: "US", isActive: true } as any,
  });
  const branchId = branch.id;

  // Academic year + terms (branch scoped, otherwise branch-bound users never see them)
  const yearName = `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`;
  const [year] = await AcademicYear.findOrCreate({
    where: { name: yearName, branchId },
    defaults: {
      name: yearName, branchId, startDate: new Date(),
      endDate: new Date(new Date().getFullYear() + 1, 5, 30), isCurrent: true,
    } as any,
  });
  for (let t = 0; t < 3; t++) {
    await Term.findOrCreate({
      where: { academicYearId: year.id, name: `Term ${t + 1}` },
      defaults: { academicYearId: year.id, branchId, name: `Term ${t + 1}`, isCurrent: t === 0 } as any,
    });
  }

  // Classes + sections
  const classNames = ["Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6", "Grade 7", "Grade 8", "Grade 9", "Grade 10"];
  for (const name of classNames) {
    const [klass] = await SchoolClass.findOrCreate({
      where: { name, branchId },
      defaults: { name, branchId, isActive: true, capacity: 40 } as any,
    });
    for (const sec of ["A", "B"]) {
      await Section.findOrCreate({
        where: { classId: klass.id, name: sec },
        defaults: { classId: klass.id, branchId, name: sec, capacity: 20 } as any,
      });
    }
  }

  // Subjects
  const subjects = ["Mathematics", "English", "Physics", "Chemistry", "Biology", "History", "Geography", "Computer Science", "Physical Education", "Art"];
  for (let i = 0; i < subjects.length; i++) {
    await Subject.findOrCreate({
      where: { name: subjects[i], branchId },
      defaults: { name: subjects[i], branchId, code: `SUB${String(i + 1).padStart(2, "0")}`, maxMarks: 100, passMarks: 35 } as any,
    });
  }

  // Grade scale
  const scale: Array<[string, number, number, string]> = [
    ["A+", 90, 100, "DISTINCTION"], ["A", 80, 89, "EXCELLENT"], ["B+", 70, 79, "VERY GOOD"],
    ["B", 60, 69, "GOOD"], ["C", 50, 59, "AVERAGE"], ["D", 40, 49, "PASS"], ["F", 0, 39, "FAIL"],
  ];
  for (const [grade, from, to, result] of scale) {
    await GradeScale.findOrCreate({
      where: { grade, branchId },
      defaults: { branchId, name: `Grade ${grade}`, grade, minPercentage: from, maxPercentage: to, result } as any,
    });
  }

  // Fee types
  const feeTypes = [
    { name: "Tuition Fee", category: "tuition", amount: 2500, isMandatory: true },
    { name: "Transport Fee", category: "transport", amount: 800, isMandatory: false },
    { name: "Hostel Fee", category: "hostel", amount: 1500, isMandatory: false },
    { name: "Library Fee", category: "misc", amount: 200, isMandatory: false },
  ];
  for (const f of feeTypes) {
    await FeeType.findOrCreate({
      where: { name: f.name, branchId },
      defaults: { ...f, branchId, installments: 1, billingCycle: "term" } as any,
    });
  }

  // Super admin account
  const { password, generated } = seedAdminPassword();
  const [admin, created] = await User.findOrCreate({
    where: { email: "admin@school.local" },
    defaults: {
      username: "superadmin",
      email: "admin@school.local",
      firstName: "Super",
      lastName: "Admin",
      role: "super_admin",
      passwordHash: await hashPassword(password),
      emailVerified: true,
      isActive: true,
      branchId,
    } as any,
  });

  // Lock-in the seed markers
  await Settings.upsert({ scope: "system", key: "seeded", value: "true", description: "seed ran" });
  await Settings.upsert({ scope: "system", key: "schoolName", value: "Enterprise School", isPublic: true });
  await Settings.upsert({ scope: "system", key: "contactEmail", value: "office@school.local", isPublic: true });

  if (created && generated) {
    // Shown once, only when we had to invent a password (production without SEED_ADMIN_PASSWORD).
    logger.warn(`Seeders: super admin created (admin@school.local). One-time generated password: ${password} — change it immediately.`);
  } else if (created) {
    logger.info(`Seeders: done. Super admin -> admin@school.local (id=${admin.id})${process.env.SEED_ADMIN_PASSWORD ? "" : " / Admin@123 (dev default)"}`);
  } else {
    logger.info("Seeders: done. Super admin already existed, password untouched.");
  }
}
