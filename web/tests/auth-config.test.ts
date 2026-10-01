import type { BetterAuthOptions } from "better-auth";
import { describe, expect, it } from "vitest";
import { auth } from "../src/lib/auth";

// Read through the general options type: auth.options is inferred from the literal config, which has no
// `update` hook to look at once it's gone.
const options: BetterAuthOptions = auth.options;

describe("admin promotion", () => {
  it("is not wired to user updates (a demotion must stick)", () => {
    expect(options.databaseHooks?.user?.update?.after).toBeUndefined();
    expect(options.emailVerification?.afterEmailVerification).toBeTypeOf("function");
  });
});
