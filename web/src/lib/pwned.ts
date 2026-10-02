import { createHash } from "node:crypto";
import { BASE_ERROR_CODES, type BetterAuthPlugin } from "better-auth";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";

// Routes that set a password, and the body field each reads (better-auth 1.7.7, admin plugin). Not covered:
// server-only setPassword (no route) and the email-otp/phone-number reset routes (plugins not installed). The test
// "matches better-auth's own routes" catches renamed routes and new newPassword routes on a better-auth upgrade.
export const PASSWORD_FIELDS: Readonly<Record<string, "password" | "newPassword">> = {
  "/sign-up/email": "password",
  "/admin/create-user": "password",
  "/change-password": "newPassword",
  "/reset-password": "newPassword",
  "/admin/set-user-password": "newPassword",
};

// Password routes that refuse a request without a session (401; getAuthoritativeSessionFromCtx in better-auth 1.7.7's
// sensitiveSessionMiddleware, adminMiddleware and createUser). /admin/create-user also accepts server-side calls (no
// request, no headers) without one.
export const SESSION_PATHS: ReadonlySet<string> = new Set(["/change-password", "/admin/create-user", "/admin/set-user-password"]);

// The password a request sets, or null (another path, or a missing/non-string value the endpoint will reject).
export function passwordFrom(path: string | undefined, body: unknown): string | null {
  const field = path && Object.hasOwn(PASSWORD_FIELDS, path) ? PASSWORD_FIELDS[path] : null;
  const value = field && body && typeof body === "object" ? (body as Record<string, unknown>)[field] : null;
  return typeof value === "string" && value ? value : null;
}

// How many times the range response lists `suffix` (uppercase hex); padding entries (Add-Padding) and absent
// suffixes count 0. Anything that isn't a range list (an empty body, a proxy's HTML page, a malformed line) throws,
// so the check fails closed instead of reading it as "not breached".
export function breachCount(body: string, suffix: string): number {
  const lines = body.split(/\r?\n/).filter(Boolean);
  if (!lines.length) throw new Error("empty range response");
  let count = 0;
  for (const line of lines) {
    const entry = /^([0-9A-F]{35}):(\d+)$/i.exec(line);
    if (!entry) throw new Error(`malformed range line "${line.slice(0, 60)}"`);
    if (entry[1].toUpperCase() === suffix) count = Number(entry[2]);
  }
  return count;
}

async function isBreached(password: string, timeoutMs: number): Promise<boolean> {
  // SHA-1 because the Pwned Passwords range API only matches SHA-1 (or NTLM) hashes. This is a lookup, not storage:
  // the hash is never kept, and only its first 5 hex chars leave the server. Passwords are stored with better-auth's
  // scrypt. CodeQL's js/insufficient-password-hash flags this line; dismissed as a false positive (alert #2).
  const hash = createHash("sha1").update(password).digest("hex").toUpperCase();
  try {
    // k-anonymity: only the first 5 hex characters of the hash leave the server.
    const res = await fetch(`https://api.pwnedpasswords.com/range/${hash.slice(0, 5)}`, {
      headers: { "Add-Padding": "true", "User-Agent": "matherlynet" },
      // Covers the body too, and cancels the request instead of leaving it running.
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return breachCount(await res.text(), hash.slice(5)) > 0;
  } catch (error) {
    // Logged as an object so its cause chain prints (undici's "fetch failed" carries ENOTFOUND, ECONNRESET, a TLS
    // error…), and attached as the 503's cause, which onAPIError in auth.ts reports to Sentry.
    console.error("pwned: api.pwnedpasswords.com lookup failed; password refused:", error);
    const unavailable = new APIError("SERVICE_UNAVAILABLE", { message: "Couldn't check the password right now. Please try again." });
    throw Object.assign(unavailable, { cause: error });
  }
}

// Have I Been Pwned, checked before the endpoint runs. Replaces better-auth's haveIBeenPwned plugin (1.7.7), which
// checks inside password.hash: /reset-password has consumed the token by then, so a refused password burned the
// reset link (better-auth#10632), and its lookup had no timeout or abort. Upstream fixes #10717 and #11051 were
// open as of 1.7.7; re-evaluate this plugin once both ship.
// Fails closed: if the lookup fails or takes longer than timeoutMs, the password is refused with a 503. It runs
// before the endpoint's own validation, so during an outage sign-up, reset and signed-in password changes get the
// 503 (the rate limiter bounds them); signed-out requests to session-gated routes skip it and get their 401.
export function pwnedPasswordCheck(timeoutMs = 5_000): BetterAuthPlugin {
  return {
    id: "pwned-password-check",
    hooks: {
      before: [
        {
          matcher: (ctx) => passwordFrom(ctx.path, ctx.body) !== null,
          handler: createAuthMiddleware(async (ctx) => {
            const password = passwordFrom(ctx.path, ctx.body);
            if (!password) return;
            // A request the endpoint will refuse with 401 isn't worth a lookup (nor a 503 during an outage): refuse it
            // here. Refusing, not skipping the check, so a read that disagrees with the endpoint's (a failed read, or
            // headers a later before hook supplies) can't let a password through unchecked.
            if (SESSION_PATHS.has(ctx.path) && (ctx.request || ctx.headers)) {
              // Read like getAuthoritativeSessionFromCtx (no cached session or cookie cache) but without refreshing:
              // this hook's Set-Cookie is dropped (the endpoint's response headers replace it), so the endpoint's
              // own read must be the one that refreshes.
              ctx.context.session = null;
              if (!(await getSessionFromCtx(ctx, { disableCookieCache: true, disableRefresh: true }))) {
                throw APIError.from("UNAUTHORIZED", { message: "Unauthorized", code: "UNAUTHORIZED" });
              }
            }
            // The endpoints' own length rules, first, so a short password is reported as short (not compromised) and
            // costs no lookup. /admin/create-user checks only the maximum in better-auth 1.7.7: this adds the minimum.
            const { minPasswordLength, maxPasswordLength } = ctx.context.password.config;
            if (password.length < minPasswordLength) throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.PASSWORD_TOO_SHORT);
            if (password.length > maxPasswordLength) throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.PASSWORD_TOO_LONG);
            if (await isBreached(password, timeoutMs)) {
              throw new APIError("BAD_REQUEST", {
                message: "The password you entered has been compromised. Please choose a different password.",
                code: "PASSWORD_COMPROMISED",
              });
            }
          }),
        },
      ],
    },
  };
}
