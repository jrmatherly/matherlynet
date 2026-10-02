import type { BetterAuthOptions } from "better-auth";
import { describe, expect, it } from "vitest";
import { auth } from "../src/lib/auth";

// Read through the general options type: auth.options is inferred from the literal config.
// (Admin promotion is covered by behavior in admin-promotion.test.ts.)
const options: BetterAuthOptions = auth.options;

describe("rate limiting", () => {
  it("skips /ok, the K8s probe path, so probes never touch the database", () => {
    expect(options.rateLimit?.customRules?.["/ok"]).toBe(false);
  });
});

describe("password length", () => {
  // The limits better-auth enforces (resolved from options and its defaults), which the breached-password hook also
  // applies to /admin/create-user. Reading the resolved values catches a changed default, not just a changed option.
  it("requires 12 to 128 characters", async () => {
    expect((await auth.$context).password.config).toEqual({ minPasswordLength: 12, maxPasswordLength: 128 });
  });
});
