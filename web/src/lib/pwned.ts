import { APIError, type BetterAuthPlugin } from "better-auth";
import { haveIBeenPwned } from "better-auth/plugins/haveibeenpwned";

// Settles like `promise`, or rejects with onTimeout() after `ms`.
export function withTimeout<T>(promise: Promise<T>, ms: number, onTimeout: () => Error): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(onTimeout()), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// Have I Been Pwned, bounded: the upstream plugin (better-auth 1.7.7) has no timeout, so a slow or unreachable
// api.pwnedpasswords.com hangs sign-up and password changes. Its init wraps ctx.password.hash as "check, then hash"
// for its paths (dist/plugins/haveibeenpwned/index.mjs). Given a no-op hash it leaves only the check, which is
// bounded here; the real hash runs after, outside the limit. Still fails closed; a timed-out lookup isn't aborted.
// tests/pwned-real.test.ts pins this against the real plugin: re-run it on better-auth upgrades.
export function boundedPwned(timeoutMs = 5_000): BetterAuthPlugin {
  const upstream = haveIBeenPwned();
  return {
    ...upstream,
    init(ctx) {
      // Captured now: better-auth merges the returned password into this same context, so reading
      // ctx.password.hash at call time would call this wrapper again.
      const hash = ctx.password.hash;
      const check = upstream.init({ ...ctx, password: { ...ctx.password, hash: async () => "" } }).context.password.hash;
      return {
        context: {
          password: {
            ...ctx.password,
            hash: async (password: string) => {
              await withTimeout(check(password), timeoutMs, () => {
                // Logged here: better-auth doesn't log a 503 it returns, and Sentry may be off.
                console.error(`pwned: api.pwnedpasswords.com didn't answer within ${timeoutMs} ms; password refused`);
                return new APIError("SERVICE_UNAVAILABLE", { message: "Couldn't check the password right now. Please try again." });
              });
              return hash(password);
            },
          },
        },
      };
    },
  };
}
