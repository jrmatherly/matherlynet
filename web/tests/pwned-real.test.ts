// boundedPwned with the real upstream haveIBeenPwned plugin inside a real betterAuth (memoryAdapter): pins the
// assumptions pwned.ts makes about the plugin's init shape, which the unit tests in pwned.test.ts mock away.
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { afterEach, describe, expect, it, vi } from "vitest";
import { boundedPwned } from "../src/lib/pwned";

const PASSWORD = "a-long-unpwned-test-password-91";

function makeAuth(opts: { timeoutMs?: number; slowHashMs?: number } = {}) {
  return betterAuth({
    baseURL: "http://localhost:4321",
    secret: "test-secret-test-secret-test-secret-123",
    database: memoryAdapter({ user: [], session: [], account: [], verification: [] }),
    emailAndPassword: {
      enabled: true,
      // A deliberately slow "scrypt", to check the bound covers only the Have I Been Pwned lookup.
      ...(opts.slowHashMs && {
        password: {
          hash: async (p: string) => (await new Promise((r) => setTimeout(r, opts.slowHashMs)), `h:${p}`),
          verify: async ({ hash, password }: { hash: string; password: string }) => hash === `h:${password}`,
        },
      }),
    },
    plugins: [boundedPwned(opts.timeoutMs ?? 200)],
  });
}
const signUp = (auth: ReturnType<typeof makeAuth>, email: string, password = PASSWORD) =>
  auth.api.signUpEmail({ body: { email, password, name: "T" } });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("boundedPwned with the real upstream plugin", () => {
  it("sign-up fails closed with SERVICE_UNAVAILABLE within the bound when the lookup never answers", async () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const t0 = Date.now();
    await expect(signUp(makeAuth({ timeoutMs: 200 }), "a@example.test")).rejects.toMatchObject({
      status: "SERVICE_UNAVAILABLE",
      statusCode: 503,
    });
    expect(Date.now() - t0).toBeLessThan(1500);
    expect(String(vi.mocked(fetch).mock.calls[0][0])).toMatch(/^https:\/\/api\.pwnedpasswords\.com\/range\/[0-9A-F]{5}$/);
  });

  it("still rejects a compromised password", async () => {
    // SHA-1("password") = 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8
    vi.stubGlobal("fetch", vi.fn(async () => new Response("1E4C9B93F3F0682250B6CF8331B7EE68FD8:9999\r\n", { status: 200 })));
    await expect(signUp(makeAuth(), "b@example.test", "password")).rejects.toMatchObject({ status: "BAD_REQUEST" });
  });

  it("logs the timeout, so a refused sign-up is visible to an operator", async () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await signUp(makeAuth({ timeoutMs: 100 }), "c@example.test").catch(() => {});
    expect(log.mock.calls.flat().join(" ")).toMatch(/pwnedpasswords/);
  });

  it("doesn't count a slow password hash against the lookup's bound", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 200 })));
    await expect(signUp(makeAuth({ timeoutMs: 100, slowHashMs: 300 }), "d@example.test")).resolves.toMatchObject({
      user: { email: "d@example.test" },
    });
  });
});
