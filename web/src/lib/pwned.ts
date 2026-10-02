import { createHash } from "node:crypto";
import { BASE_ERROR_CODES, type BetterAuthPlugin } from "better-auth";
import { APIError, createAuthMiddleware, getSession } from "better-auth/api";
import type { admin } from "better-auth/plugins/admin";

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

// Password routes that refuse a call without a session (401; getAuthoritativeSessionFromCtx in better-auth 1.7.7's
// sensitiveSessionMiddleware, adminMiddleware and createUser), even server-side, except /admin/create-user: it
// accepts a server-side call (no request, no headers) without one.
export const SESSION_PATHS: ReadonlySet<string> = new Set(["/change-password", "/admin/create-user", "/admin/set-user-password"]);

// Typed from the admin plugin with default roles (auth.ts passes no `ac`/`roles`), so a misspelled permission or error
// code fails to compile. `admin<{}>` (an instantiation expression) keeps $ERROR_CODES' literal keys.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
type AdminPlugin = ReturnType<typeof admin<{}>>;
type HasPermissionBody = NonNullable<Parameters<AdminPlugin["endpoints"]["userHasPermission"]>[0]>["body"];
export interface AdminCheck {
  permissions: HasPermissionBody["permissions"];
  code: keyof AdminPlugin["$ERROR_CODES"];
}

// The admin permissions a request to an admin password route needs, in the order its endpoint checks them, each
// with the error code that endpoint refuses (403) with (better-auth 1.7.7 plugins/admin/routes.mjs): creating a
// user also needs set-role when the body sets a role, and ban when it sets ban fields.
export function adminChecks(path: string, body: unknown): AdminCheck[] {
  if (path === "/admin/set-user-password") return [{ permissions: { user: ["set-password"] }, code: "YOU_ARE_NOT_ALLOWED_TO_SET_USERS_PASSWORD" }];
  if (path !== "/admin/create-user") return [];
  const { role, data } = (body ?? {}) as { role?: unknown; data?: unknown };
  const { role: dataRole, ...fields } = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const checks: AdminCheck[] = [{ permissions: { user: ["create"] }, code: "YOU_ARE_NOT_ALLOWED_TO_CREATE_USERS" }];
  if ((role ?? dataRole) !== undefined) checks.push({ permissions: { user: ["set-role"] }, code: "YOU_ARE_NOT_ALLOWED_TO_CHANGE_USERS_ROLE" });
  if (["banned", "banReason", "banExpires"].some((key) => Object.hasOwn(fields, key))) {
    checks.push({ permissions: { user: ["ban"] }, code: "YOU_ARE_NOT_ALLOWED_TO_BAN_USERS" });
  }
  return checks;
}

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
// before the endpoint's own validation, so during an outage sign-up, reset, signed-in password changes, permitted
// admins and server-side user creation get the 503 (the rate limiter bounds them). Requests the route would refuse
// anyway get the same status here, without a lookup: no session (401), a missing admin permission (403, with the
// admin plugin's error code), a password outside the length rules (400, better-auth's code).
// Must be the only before hook on password routes: before hooks see the original body, so one that rewrote the
// password would have it stored unchecked (a test in auth-config.test.ts enforces this).
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
            // here. Refusing, not skipping the check: before hooks all see the original request (context changes they
            // return apply only after every before hook has run), so this read can disagree with the endpoint's.
            if (SESSION_PATHS.has(ctx.path) && (ctx.path !== "/admin/create-user" || ctx.request || ctx.headers)) {
              // Read without the cookie cache, like getAuthoritativeSessionFromCtx, but without refreshing: this hook's
              // Set-Cookie is dropped (the endpoint's response headers replace it), so the endpoint's own read must be
              // the one that refreshes. Not getSessionFromCtx: it turns a failed read (database down) into "no
              // session", a 401; getSession throws its 500, which onAPIError (auth.ts) logs and reports. Without
              // headers getSession throws a 400 ("Headers is required"), so a header-less call has no session.
              const session = ctx.headers
                ? ((await getSession()({
                    ...ctx,
                    method: "GET",
                    asResponse: false,
                    returnHeaders: false,
                    query: { disableCookieCache: true, disableRefresh: true },
                  } as never)) as unknown as { user: { id: string; role?: HasPermissionBody["role"] | null } } | null)
                : null;
              if (!session) throw APIError.from("UNAUTHORIZED", { message: "Unauthorized", code: "UNAUTHORIZED" });
              // Likewise the admin routes' 403s, by the admin plugin's own rule (roles, adminUserIds), asked through its
              // userHasPermission endpoint: its hasPermission isn't exported. Called without a session or headers, that
              // endpoint judges the given user id and role (with no role, the user's stored one). It clears
              // ctx.context.session on the way; harmless, since every one of these endpoints reads the session again.
              const adminPlugin = ctx.context.options.plugins?.find((p) => p.id === "admin") as AdminPlugin | undefined;
              if (adminPlugin) {
                for (const { permissions, code } of adminChecks(ctx.path, ctx.body)) {
                  const { success } = await adminPlugin.endpoints.userHasPermission({
                    body: { userId: session.user.id, role: session.user.role ?? undefined, permissions },
                    context: ctx.context,
                  });
                  if (!success) throw APIError.from("FORBIDDEN", adminPlugin.$ERROR_CODES[code]);
                }
              }
            }
            // The endpoints' own length rules, before the lookup, so a short password is reported as short (not
            // compromised) and costs no lookup. /admin/create-user checks only the maximum in better-auth 1.7.7: this
            // adds the minimum.
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
