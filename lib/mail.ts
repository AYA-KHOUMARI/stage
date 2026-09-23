import dns from "node:dns";
import nodemailer from "nodemailer";

dns.setDefaultResultOrder("ipv4first");

type SendEmailInput = {
  to: string;
  subject: string;
  text: string;
};

function mailFrom(): string {
  const from =
    process.env.MAIL_FROM ||
    process.env.SMTP_FROM ||
    process.env.SMTP_USER;

  if (!from) {
    throw new Error(
      "Email sender not configured. Set MAIL_FROM (or SMTP_USER) in your environment.",
    );
  }
  return from;
}

export async function sendTransactionalEmail(
  input: SendEmailInput,
): Promise<void> {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const password = process.env.SMTP_PASSWORD?.replace(/\s/g, "");
  const from = mailFrom();

  if (!host || !user || !password) {
    throw new Error(
      "SMTP is not fully configured. Please set SMTP_HOST, SMTP_USER, and SMTP_PASSWORD in your environment.",
    );
  }

  const port = Number(process.env.SMTP_PORT || 587);
  const secure = process.env.SMTP_SECURE === "true" || port === 465;

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass: password },
  });

  await transporter.sendMail({ from, to: input.to, subject: input.subject, text: input.text });
}
