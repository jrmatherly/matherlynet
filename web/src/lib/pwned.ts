import { createHash } from "node:crypto";
import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";

// Endpoints that set a password, and the body field each reads (better-auth 1.7.7 routes).
const PASSWORD_FIELDS: Record<string, "password" | "newPassword"> = {
  "/sign-up/email": "password",
  "/admin/create-user": "password",
  "/change-password": "newPassword",
  "/reset-password": "newPassword",
  "/admin/set-user-password": "newPassword",
};

// The password a request sets, or null (another path, or a missing/non-string value the endpoint will reject).
export function passwordFrom(path: string | undefined, body: unknown): string | null {
  const field = path && Object.hasOwn(PASSWORD_FIELDS, path) ? PASSWORD_FIELDS[path] : null;
  const value = field && body && typeof body === "object" ? (body as Record<string, unknown>)[field] : null;
  return typeof value === "string" && value ? value : null;
}

// Times the range response lists this hash suffix; padding entries (Add-Padding) and absent suffixes count 0.
export function breachCount(body: string, suffix: string): number {
  for (const line of body.split(/\r?\n/)) {
    const [hashSuffix, count] = line.split(":");
    if (hashSuffix.toUpperCase() !== suffix) continue;
    const n = Number(count);
    if (!Number.isSafeInteger(n) || n < 0) throw new Error(`malformed count "${count}"`);
    return n;
  }
  return 0;
}

async function isBreached(password: string, timeoutMs: number): Promise<boolean> {
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
    // Logged with the cause (timeout, HTTP status): onAPIError in auth.ts logs and reports only the 503 itself.
    console.error(`pwned: api.pwnedpasswords.com lookup failed (${error instanceof Error ? error.message : String(error)}); password refused`);
    throw new APIError("SERVICE_UNAVAILABLE", { message: "Couldn't check the password right now. Please try again." });
  }
}

// Have I Been Pwned, checked before the endpoint runs. Replaces better-auth's haveIBeenPwned plugin (1.7.7), which
// checks inside password.hash: /reset-password has consumed the token by then, so a refused password burned the
// reset link (better-auth#10632, fix pending in #10717), and its lookup had no timeout or abort (#11051).
// Fails closed: if the lookup fails or takes longer than timeoutMs, the password is refused with a 503.
export function pwnedPasswordCheck(timeoutMs = 5_000): BetterAuthPlugin {
  return {
    id: "pwned-password-check",
    hooks: {
      before: [
        {
          matcher: (ctx) => passwordFrom(ctx.path, ctx.body) !== null,
          handler: createAuthMiddleware(async (ctx) => {
            const password = passwordFrom(ctx.path, ctx.body);
            if (password && (await isBreached(password, timeoutMs))) {
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
