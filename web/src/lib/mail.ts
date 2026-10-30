import { createHash } from "node:crypto";
import nodemailer from "nodemailer";
import { captureError } from "./sentry";

// SMTP_URL comes from Aspire: Mailpit under `aspire run`, the smtp-url parameter when deployed.
const transport = process.env.SMTP_URL ? nodemailer.createTransport(process.env.SMTP_URL) : null;

/** The hash the throttle keys on and the only form of an address that reaches a log line (its first 8 hex chars). */
export const recipientKey = (to: string): string => createHash("sha256").update(to.trim().toLowerCase()).digest("hex");

/** A code only: drizzle's and nodemailer's error messages can quote query parameters or the envelope's address. */
export function errorCode(error: unknown): string {
  const e = error as { cause?: { code?: unknown }; code?: unknown; name?: unknown } | null | undefined;
  const raw = e?.cause?.code ?? e?.code ?? e?.name;
  return typeof raw === "string" && /^[\w.-]{1,40}$/.test(raw) ? raw : "unknown";
}

// Fire-and-forget: better-auth callers must not await mail (timing attacks), so failures are logged here.
export function sendMail(to: string, subject: string, text: string): void {
  const who = recipientKey(to).slice(0, 8);
  if (!transport) {
    console.warn(`mail: SMTP_URL is not set; dropped "${subject}" to ${who}`);
    return;
  }
  transport
    .sendMail({ from: process.env.MAIL_FROM || "MatherlyNet <no-reply@matherly.net>", to, subject, text })
    .catch((error: unknown) => {
      const message = `mail: failed to send "${subject}" to ${who} (${errorCode(error)})`;
      console.error(message);
      captureError(new Error(message));
    });
}
