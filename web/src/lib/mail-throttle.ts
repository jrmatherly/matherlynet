import { sql } from "drizzle-orm";
import { db } from "../db";
import { errorCode, recipientKey, sendMail } from "./mail";
import { captureError } from "./sentry";

// One address legitimately gets a sign-up mail, a re-send or two and a password reset in an hour, so 5 fits; a flood
// is capped at 120 mails a day to one address. better-auth's per-IP limits still apply on top.
export const MAIL_LIMIT = { max: 5, windowMinutes: 60 } as const;

// Logged and sent to Sentry as a fresh Error: the cluster has no log sink, and a missing table or an exhausted pool
// would otherwise stop every verification and reset mail with nothing to show for it.
function failed(what: string, error: unknown): void {
  const message = `mail: ${what} (${errorCode(error)})`;
  console.error(message);
  captureError(new Error(message));
}

// One fixed window per recipient in mail_throttle, counted in one upsert so replicas agree without a lock. The key is
// a hash, so the table never holds an address. A database error refuses: no mail rather than an unlimited one.
export async function allowMail(to: string): Promise<boolean> {
  const key = recipientKey(to);
  const expired = sql`mail_throttle.window_start < now() - make_interval(mins => ${MAIL_LIMIT.windowMinutes})`;
  try {
    const { rows } = await db.execute<{ count: number }>(sql`
      insert into mail_throttle (recipient, window_start, count) values (${key}, now(), 1)
      on conflict (recipient) do update set
        count = case when ${expired} then 1 else mail_throttle.count + 1 end,
        window_start = case when ${expired} then now() else mail_throttle.window_start end
      returning count
    `);
    if (rows[0].count <= MAIL_LIMIT.max) return true;
    console.warn(`mail: throttled recipient ${key.slice(0, 8)}`);
  } catch (error) {
    failed("throttle check failed", error);
  }
  return false;
}

// Detached like sendMail: better-auth awaits its mail callbacks, and a database round trip that runs only for an
// existing user would widen the timing gap between known and unknown addresses on /request-password-reset.
export function sendThrottled(to: string, subject: string, text: string): void {
  void allowMail(to)
    .then((ok) => {
      if (ok) sendMail(to, subject, text);
    })
    .catch((error: unknown) => failed("throttled send failed", error));
}
