import { afterEach, describe, expect, it, vi } from "vitest";

// The upstream plugin's wrapped hash never settles: an unreachable api.pwnedpasswords.com.
vi.mock("better-auth/plugins/haveibeenpwned", () => ({
  haveIBeenPwned: () => ({
    id: "have-i-been-pwned",
    init: () => ({ context: { password: { hash: () => new Promise(() => {}) } } }),
  }),
}));

const { boundedPwned, withTimeout } = await import("../src/lib/pwned");

afterEach(() => {
  vi.useRealTimers();
});

describe("withTimeout", () => {
  it("rejects with the timeout error when the promise never settles", async () => {
    vi.useFakeTimers();
    const result = withTimeout(new Promise(() => {}), 50, () => new Error("too slow"));
    const assertion = expect(result).rejects.toThrow("too slow");
    await vi.advanceTimersByTimeAsync(50);
    await assertion;
  });
  it("passes a value through", async () => {
    await expect(withTimeout(Promise.resolve(true), 50, () => new Error("too slow"))).resolves.toBe(true);
  });
  it("passes a rejection through", async () => {
    await expect(withTimeout(Promise.reject(new Error("compromised")), 50, () => new Error("too slow"))).rejects.toThrow("compromised");
  });
});

describe("boundedPwned", () => {
  it("fails closed with SERVICE_UNAVAILABLE when the check hangs", async () => {
    vi.useFakeTimers();
    const plugin = boundedPwned(50);
    const ctx = { password: { hash: async () => "hashed" } };
    const { context } = plugin.init!(ctx as never) as { context: { password: { hash: (p: string) => Promise<string> } } };
    const assertion = expect(context.password.hash("correct horse")).rejects.toMatchObject({ status: "SERVICE_UNAVAILABLE" });
    await vi.advanceTimersByTimeAsync(50);
    await assertion;
  });
});
