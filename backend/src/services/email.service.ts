import nodemailer, { Transporter } from "nodemailer";
import env from "../config";
import { logger } from "../config/logger";

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (!env.mail.host) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.mail.host,
      port: env.mail.port,
      secure: env.mail.port === 465,
      auth: env.mail.user ? { user: env.mail.user, pass: env.mail.pass } : undefined,
    });
  }
  return transporter;
}

export async function sendMail(opts: {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}): Promise<boolean> {
  const t = getTransporter();
  if (!t) {
    // mail not configured — nothing to send
    logger.warn(`SMTP not configured, skipping email "${opts.subject}" to ${opts.to}`);
    return false;
  }
  await t.sendMail({
    from: env.mail.from,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
  });
  return true;
}

export async function sendWelcomeEmail(to: string, name: string, tempPassword: string): Promise<void> {
  await sendMail({
    to,
    subject: "Welcome to School Management System",
    html: `<p>Hi ${name},</p><p>Your account has been created.</p><p>Use this temporary password to sign in: <b>${tempPassword}</b></p><p>You will be asked to change it on first login.</p>`,
  });
}