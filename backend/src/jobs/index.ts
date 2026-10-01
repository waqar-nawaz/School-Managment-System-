import cron from "node-cron";
import { Op } from "sequelize";
import { Invoice, BookIssue, RefreshToken, Student, StudentGuardian, Parent } from "../models";
import { logger } from "../config/logger";
import { notifyMany } from "../services/notification.service";

let started = false;

/** Flag invoices as overdue after their due date. */
async function markInvoicesOverdue(): Promise<void> {
  const [rows] = await Invoice.update(
    { status: "overdue" },
    { where: { dueDate: { [Op.lt]: new Date() }, status: ["pending", "partial"] } }
  );
  if (rows) logger.info(`[job:fees] marked ${rows} invoice(s) overdue`);
}

/** Flag late library loans as overdue (they stay returnable) and tell the borrower. */
async function markBooksOverdue(): Promise<void> {
  const issues = await BookIssue.findAll({
    where: { status: "issued", dueDate: { [Op.lt]: new Date() } },
  });
  if (!issues.length) return;
  await BookIssue.update(
    { status: "overdue" },
    { where: { id: { [Op.in]: issues.map((i) => i.id) } } }
  );
  await notifyMany(
    Array.from(new Set(issues.map((i) => i.userId))),
    "Book overdue",
    "Please return your overdue library book."
  );
  logger.info(`[job:library] flagged ${issues.length} book(s) overdue`);
}

/** Weekly reminder to the student's login AND the linked parents (invoice.studentId is a Student id, not a User id). */
async function sendFeeReminders(): Promise<void> {
  const invoices = await Invoice.findAll({ where: { status: "overdue" }, attributes: ["id", "studentId"] });
  if (!invoices.length) return;
  const studentIds = Array.from(new Set(invoices.map((i) => Number(i.studentId))));

  const students = await Student.findAll({ where: { id: studentIds }, attributes: ["id", "userId"] });
  const links = await StudentGuardian.findAll({ where: { studentId: studentIds }, attributes: ["parentId"] });
  const parents = links.length
    ? await Parent.findAll({ where: { id: Array.from(new Set(links.map((l) => Number(l.parentId)))) }, attributes: ["userId"] })
    : [];

  const userIds = new Set<number>();
  for (const s of students) if (s.userId) userIds.add(Number(s.userId));
  for (const p of parents) if (p.userId) userIds.add(Number(p.userId));

  await notifyMany(
    Array.from(userIds),
    "Fee payment reminder",
    "One or more invoices are overdue. Please clear them at your earliest convenience."
  );
  logger.info(`[job:fees] reminded ${userIds.size} account(s) about ${invoices.length} overdue invoice(s)`);
}

async function purgeExpiredSessions(): Promise<void> {
  const rows = await RefreshToken.destroy({ where: { expiresAt: { [Op.lt]: new Date() } } });
  if (rows) logger.info(`[job:sessions] purged ${rows} expired refresh token(s)`);
}

const safe = (name: string, fn: () => Promise<void>) => async () => {
  try {
    await fn();
  } catch (err) {
    logger.error(`[job:${name}] failed`, err);
  }
};

/**
 * Schedules the recurring jobs. Called once from server.ts, and only when jobs are enabled
 * (non-production, or RUN_JOBS=true) so multiple instances don't all send duplicate reminders.
 */
export function startJobs(): void {
  if (started) return;
  started = true;
  cron.schedule("0 4 * * *", safe("sessions", purgeExpiredSessions));
  cron.schedule("0 5 * * *", safe("invoices", markInvoicesOverdue));
  cron.schedule("0 6 * * *", safe("library", markBooksOverdue));
  cron.schedule("0 8 * * 1", safe("fee-reminders", sendFeeReminders));
  logger.info("Scheduled jobs started");
}
