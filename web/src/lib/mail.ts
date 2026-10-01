import nodemailer from "nodemailer";

// SMTP_URL comes from Aspire: Mailpit under `aspire run`, the smtp-url parameter when deployed.
const transport = process.env.SMTP_URL ? nodemailer.createTransport(process.env.SMTP_URL) : null;

// Fire-and-forget: better-auth callers must not await mail (timing attacks), so failures are logged here.
export function sendMail(to: string, subject: string, text: string): void {
  if (!transport) {
    console.warn(`mail: SMTP_URL is not set; dropped "${subject}" to ${to}`);
    return;
  }
  transport
    .sendMail({ from: process.env.MAIL_FROM || "matherlynet <no-reply@matherly.net>", to, subject, text })
    .catch((err: unknown) => console.error(`mail: failed to send "${subject}" to ${to}`, err));
}
