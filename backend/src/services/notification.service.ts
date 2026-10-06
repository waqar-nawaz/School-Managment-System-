import { Notification, User } from "../models";
import { sendMail } from "./email.service";
import { sendSms } from "./sms.service";
import { logger } from "../config/logger";

export interface NotifyOptions {
  userId: number;
  title: string;
  body: string;
  channel?: "system" | "email" | "sms";
  data?: Record<string, unknown>;
}

export async function notify(opts: NotifyOptions): Promise<void> {
  const channel = opts.channel ?? "system";

  const user = await User.findByPk(opts.userId, { attributes: ["id", "email", "phone", "branchId", "isActive"] }).catch((err) => {
    logger.error("User lookup for notification failed", err);
    return null;
  });
  if (!user || !user.isActive) return;

  try {
    await Notification.create({
      userId: opts.userId,
      branchId: user.branchId ?? undefined,
      channel,
      title: opts.title,
      body: opts.body,
      data: opts.data ?? {},
    });
  } catch (err) {
    logger.error("Notification create failed", err);
  }

  if (channel === "email" && user.email) {
    await sendMail({ to: user.email, subject: opts.title, html: opts.body }).catch((err) => {
      logger.error(`Email notification to user ${opts.userId} failed`, err);
    });
  }
  if (channel === "sms" && (user as any).phone) {
    await sendSms((user as any).phone, opts.body).catch((err) => {
      logger.error(`SMS notification to user ${opts.userId} failed`, err);
    });
  }
}

export async function notifyMany(
  userIds: number[],
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<void> {
  await Promise.allSettled(
    userIds.map((uid) => notify({ userId: uid, title, body, channel: "system", data }))
  );
}