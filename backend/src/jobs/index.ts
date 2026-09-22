import cron from "node-cron";
import { Op } from "sequelize";
import { Invoice, BookIssue, RefreshToken } from "../models";
import { logger } from "../config/logger";
import { notifyMany } from "../services/notification.service";

/** Flag invoices as overdue after their due date. (daily) */
cron.schedule("0 5 * * *", async () => {
  const [rows] = await Invoice.update(
    { status: "overdue" },
    { where: { dueDate: { [Op.lt]: new Date() }, status: ["pending", "partial"] } }
  );
  if (rows) logger.info(`[job:fees] marked ${rows} invoice(s) overdue`);
});

/** Flag book issues as overdue. (daily) */
cron.schedule("0 6 * * *", async () => {
  const issues = await BookIssue.findAll({
    where: { status: "issued", dueDate: { [Op.lt]: new Date() } },
  });
  if (issues.length) {
    await BookIssue.update(
      { status: "overdue" },
      { where: { id: { [Op.in]: issues.map((i) => i.id) } } }
    );
    await notifyMany(
      issues.map((i) => i.userId),
      "Book overdue",
      "Please return your overdue library book."
    );
    logger.info(`[job:library] flagged ${issues.length} book(s) overdue`);
  }
});

/** Fee reminders for overdue invoices. (weekly, Monday 8am) */
cron.schedule("0 8 * * 1", async () => {
  const invoices = await Invoice.findAll({ where: { status: "overdue" } });
  await notifyMany(
    invoices.map((i) => i.studentId),
    "Fee payment reminder",
    "One or more of your invoices are overdue. Please clear them at your earliest convenience."
  );
  logger.info(`[job:fees] reminded ${invoices.length} student record(s)`);
});

/** Purge expired refresh tokens. (daily) */
cron.schedule("0 4 * * *", async () => {
  const rows = await RefreshToken.destroy({
    where: { expiresAt: { [Op.lt]: new Date() } },
  });
  if (rows) logger.info(`[job:sessions] purged ${rows} expired refresh token(s)`);
});

export function startJobs(): void {
  logger.info("Scheduled jobs started (dev mode)");
}