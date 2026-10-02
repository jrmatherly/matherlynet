import type { BetterAuthOptions } from "better-auth";
import { describe, expect, it } from "vitest";
import { auth } from "../src/lib/auth";
import { PASSWORD_FIELDS } from "../src/lib/pwned";

// Read through the general options type: auth.options is inferred from the literal config.
// (Admin promotion is covered by behavior in admin-promotion.test.ts.)
const options: BetterAuthOptions = auth.options;

describe("rate limiting", () => {
  it("skips /ok, the K8s probe path, so probes never touch the database", () => {
    expect(options.rateLimit?.customRules?.["/ok"]).toBe(false);
  });
});

describe("breached-password check", () => {
  // Before hooks all see the original body (better-auth 1.7.7 applies their context changes after every one has run),
  // so another before hook that rewrote a password would have it stored unchecked (pwned.ts).
  it("is the only before hook on password routes", () => {
    expect(options.hooks?.before).toBeUndefined();
    const others = (options.plugins ?? []).filter((p) => p.id !== "pwned-password-check");
    expect(options.plugins?.some((p) => p.id === "pwned-password-check")).toBe(true);
    for (const plugin of others) {
      for (const hook of plugin.hooks?.before ?? []) {
        for (const path of Object.keys(PASSWORD_FIELDS)) {
          expect(hook.matcher({ path, body: { password: "x", newPassword: "x" } } as never), `${plugin.id} ${path}`).toBe(false);
        }
      }
    }
  });
});

describe("password length", () => {
  // The limits better-auth enforces (resolved from options and its defaults); the breached-password hook applies them
  // to /admin/create-user too. Reading the resolved values catches a changed default, not just a changed option.
  it("requires 12 to 128 characters", async () => {
    expect((await auth.$context).password.config).toEqual({ minPasswordLength: 12, maxPasswordLength: 128 });
  });
});
