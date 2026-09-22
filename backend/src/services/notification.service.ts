import { Notification } from "../models";
import { sendMail } from "./email.service";
import { sendSms } from "./sms.service";

export interface NotifyOptions {
  userId: number;
  title: string;
  body: string;
  channel?: "system" | "email" | "sms";
  data?: Record<string, unknown>;
}

export async function notify(opts: NotifyOptions): Promise<void> {
  const channel = opts.channel ?? "system";

  try {
    await Notification.create({
      userId: opts.userId,
      channel,
      title: opts.title,
      body: opts.body,
      data: opts.data ?? {},
    });
  } catch {
    /* best-effort */
  }

  if (channel === "email") {
    await sendMail({ to: "", subject: opts.title, html: opts.body }).catch(() => {});
  }
  if (channel === "sms") {
    await sendSms("", opts.body).catch(() => {});
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