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
  it("requires 12 to 128 characters (the hook applies the same rule to /admin/create-user)", () => {
    expect(options.emailAndPassword?.minPasswordLength).toBe(12);
    expect(options.emailAndPassword?.maxPasswordLength ?? 128).toBe(128);
  });
});
