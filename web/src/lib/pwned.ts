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
// api.pwnedpasswords.com hangs sign-up and password changes. Its init wraps ctx.password.hash for its paths
// (dist/plugins/haveibeenpwned/index.mjs); this wraps that again with a time limit. Still fails closed.
// Re-check the init shape on better-auth upgrades.
export function boundedPwned(timeoutMs = 5_000): BetterAuthPlugin {
  const upstream = haveIBeenPwned();
  return {
    ...upstream,
    init(ctx) {
      const { context } = upstream.init(ctx);
      const hash = context.password.hash;
      return {
        context: {
          password: {
            ...context.password,
            hash: (password: string) =>
              withTimeout(
                hash(password),
                timeoutMs,
                () => new APIError("SERVICE_UNAVAILABLE", { message: "Couldn't check the password right now. Please try again." }),
              ),
          },
        },
      };
    },
  };
}
