import env from "../config";

/** Lightweight SMS facade. Implement the provider of your choice (Twilio, etc.). */
export async function sendSms(to: string, message: string): Promise<void> {
  if (!env.sms.accountSid) return; // not configured
  const { accountSid, authToken, fromNumber } = env.sms;
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const body = new URLSearchParams({
    To: to,
    From: fromNumber,
    Body: message,
  });
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  await fetch(url, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
}