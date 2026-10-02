// pwnedPasswordCheck inside a real betterAuth (memoryAdapter), with fetch standing in for api.pwnedpasswords.com.
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { betterAuth, type BetterAuthPlugin } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import { memoryAdapter } from "better-auth/adapters/memory";
import { admin } from "better-auth/plugins";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PASSWORD_FIELDS, SESSION_PATHS, breachCount, passwordFrom, pwnedPasswordCheck } from "../src/lib/pwned";

const SAFE = "a-long-unpwned-test-password-91";
// SHA-1("password") = 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8; the range response lists suffixes after the prefix.
const BREACHED = "password";
const BREACHED_RANGE = "0018A45C4D1DEF81644B54AB7F969B88D65:0\r\n1E4C9B93F3F0682250B6CF8331B7EE68FD8:9999\r\n";
const CLEAN_RANGE = "0018A45C4D1DEF81644B54AB7F969B88D65:0\r\n";

// Typed through the generic: unused `_url`/`_init` parameters fail this repo's lint.
const answer = (body: string) =>
  vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () => new Response(body, { status: 200 }));
// Never answers; rejects when aborted, like a real fetch.
const hang = () => {
  const signals: AbortSignal[] = [];
  const fn = vi.fn(
    (_url: string, init?: RequestInit) =>
      new Promise<Response>((_, reject) => {
        const signal = init!.signal!;
        signals.push(signal);
        signal.addEventListener("abort", () => reject(signal.reason));
      }),
  );
  return { fn, signals };
};

// `before`: plugins registered ahead of the check (their before hooks run first).
function makeAuth(timeoutMs = 200, before: BetterAuthPlugin[] = []) {
  let resetToken = "";
  const db: Record<string, unknown[]> = { user: [], session: [], account: [], verification: [] };
  const auth = betterAuth({
    baseURL: "http://localhost:4321",
    secret: "test-secret-test-secret-test-secret-123",
    database: memoryAdapter(db),
    emailAndPassword: {
      enabled: true,
      sendResetPassword: async ({ token }) => {
        resetToken = token;
      },
    },
    plugins: [admin(), ...before, pwnedPasswordCheck(timeoutMs)],
  });
  return { auth, db, resetToken: () => resetToken };
}
const signUp = (auth: ReturnType<typeof makeAuth>["auth"], email: string, password: unknown = SAFE) =>
  auth.api.signUpEmail({ body: { email, password: password as string, name: "T" } });
type Auth = ReturnType<typeof makeAuth>["auth"];
// An HTTP request as the browser sends it. auth.api calls without headers are server-side calls.
const post = (auth: Auth, path: string, body: object, cookie = "") =>
  auth.handler(
    new Request(`http://localhost:4321/api/auth${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:4321", cookie },
      body: JSON.stringify(body),
    }),
  );
// Signs up and in over HTTP; returns the Cookie header for later requests. Needs a fetch stub that answers clean.
async function signedIn(auth: Auth, email: string) {
  await signUp(auth, email);
  const res = await post(auth, "/sign-in/email", { email, password: SAFE });
  return res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("breachCount", () => {
  it("reads the count for the matching suffix, case-insensitively", () => {
    expect(breachCount(BREACHED_RANGE, "1E4C9B93F3F0682250B6CF8331B7EE68FD8")).toBe(9999);
    expect(breachCount(BREACHED_RANGE.toLowerCase(), "1E4C9B93F3F0682250B6CF8331B7EE68FD8")).toBe(9999);
  });
  it("counts padding entries and absent suffixes as 0", () => {
    expect(breachCount(BREACHED_RANGE, "0018A45C4D1DEF81644B54AB7F969B88D65")).toBe(0);
    expect(breachCount(CLEAN_RANGE, "1E4C9B93F3F0682250B6CF8331B7EE68FD8")).toBe(0);
  });
  it("throws on a malformed count, so the check fails closed", () => {
    expect(() => breachCount("1E4C9B93F3F0682250B6CF8331B7EE68FD8:lots", "1E4C9B93F3F0682250B6CF8331B7EE68FD8")).toThrow(/malformed/);
    // Number("") is 0: an empty count must not read as "not breached".
    expect(() => breachCount("1E4C9B93F3F0682250B6CF8331B7EE68FD8:", "1E4C9B93F3F0682250B6CF8331B7EE68FD8")).toThrow(/malformed/);
  });
  it("throws on a body that isn't a range list (empty, or a proxy's HTML page)", () => {
    expect(() => breachCount("", "1E4C9B93F3F0682250B6CF8331B7EE68FD8")).toThrow();
    expect(() => breachCount("<html><body>Sign in to the network</body></html>", "1E4C9B93F3F0682250B6CF8331B7EE68FD8")).toThrow(/malformed/);
  });
});

describe("passwordFrom", () => {
  it("reads the field each password endpoint uses", () => {
    expect(passwordFrom("/sign-up/email", { password: "a" })).toBe("a");
    expect(passwordFrom("/admin/create-user", { password: "b" })).toBe("b");
    expect(passwordFrom("/change-password", { newPassword: "c", currentPassword: "x" })).toBe("c");
    expect(passwordFrom("/reset-password", { newPassword: "d", token: "t" })).toBe("d");
    expect(passwordFrom("/admin/set-user-password", { newPassword: "e", userId: "u" })).toBe("e");
  });
  // A better-auth upgrade that renames a route or adds one that sets `newPassword` would otherwise make the check
  // silently skip it. (Sign-up's body schema isn't enumerable and server-only setPassword has no route.)
  it("matches better-auth's own routes: every listed path exists, every routed newPassword endpoint is listed", () => {
    const auth = betterAuth({ baseURL: "http://localhost:4321", secret: "test-secret-test-secret-test-secret-123", database: memoryAdapter({}), emailAndPassword: { enabled: true }, plugins: [admin()] });
    const endpoints = Object.values(auth.api) as { path?: string; options?: { body?: { shape?: Record<string, unknown> } } }[];
    const paths = new Set(endpoints.map((e) => e.path));
    for (const path of Object.keys(PASSWORD_FIELDS)) expect(paths.has(path), path).toBe(true);
    for (const e of endpoints) {
      if (e.path && e.options?.body?.shape && "newPassword" in e.options.body.shape) expect(passwordFrom(e.path, { newPassword: "x" }), e.path).toBe("x");
    }
  });
  it("lists only password routes as session-gated", () => {
    for (const path of SESSION_PATHS) expect(Object.hasOwn(PASSWORD_FIELDS, path), path).toBe(true);
  });
  it("returns null for other paths and for missing, empty or non-string values", () => {
    expect(passwordFrom("/sign-in/email", { password: "a" })).toBeNull();
    expect(passwordFrom(undefined, { password: "a" })).toBeNull();
    expect(passwordFrom("/sign-up/email", { password: 123 })).toBeNull();
    expect(passwordFrom("/sign-up/email", { password: "" })).toBeNull();
    expect(passwordFrom("/sign-up/email", undefined)).toBeNull();
    expect(passwordFrom("/reset-password", { password: "wrong field" })).toBeNull();
  });
});

describe("pwnedPasswordCheck in better-auth", () => {
  it("refuses a breached password, sending only the 5-character hash prefix", async () => {
    const fetch = answer(BREACHED_RANGE);
    vi.stubGlobal("fetch", fetch);
    await expect(signUp(makeAuth().auth, "a@example.test", BREACHED)).rejects.toMatchObject({ status: "BAD_REQUEST" });
    expect(String(fetch.mock.calls[0][0])).toBe("https://api.pwnedpasswords.com/range/5BAA6");
  });

  it("accepts a password that isn't listed", async () => {
    vi.stubGlobal("fetch", answer(CLEAN_RANGE));
    await expect(signUp(makeAuth().auth, "b@example.test")).resolves.toMatchObject({ user: { email: "b@example.test" } });
  });

  it("fails closed with a 503 within the bound, aborts the lookup and logs it", async () => {
    const { fn, signals } = hang();
    vi.stubGlobal("fetch", fn);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const t0 = Date.now();
    await expect(signUp(makeAuth(100).auth, "c@example.test")).rejects.toMatchObject({ status: "SERVICE_UNAVAILABLE", statusCode: 503 });
    expect(Date.now() - t0).toBeLessThan(1500);
    expect(signals[0].aborted).toBe(true);
    expect(log.mock.calls.flat().join(" ")).toMatch(/pwnedpasswords/);
  });

  it("fails closed when a 200 isn't a range list (a captive portal or proxy page)", async () => {
    vi.stubGlobal("fetch", answer("<html>Please sign in</html>"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(signUp(makeAuth().auth, "h@example.test")).rejects.toMatchObject({ status: "SERVICE_UNAVAILABLE" });
  });

  it("logs the network cause and attaches it to the 503", async () => {
    const cause = Object.assign(new Error("getaddrinfo ENOTFOUND api.pwnedpasswords.com"), { code: "ENOTFOUND" });
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("fetch failed", { cause }))));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(signUp(makeAuth().auth, "i@example.test")).rejects.toMatchObject({ status: "SERVICE_UNAVAILABLE", cause: { cause } });
    expect(log.mock.calls.flat()).toContainEqual(expect.objectContaining({ cause: expect.objectContaining({ code: "ENOTFOUND" }) }));
  });

  // Real undici against a server that sends headers and then stalls: the bound must cover the body, not just fetch().
  it("aborts a lookup that stalls after the headers", async () => {
    const server = createServer((_req, res) => res.writeHead(200, { "content-type": "text/plain" }).write("0018A45C4D1DEF81644B54AB7F969B88D65:0\r\n"));
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const local = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
    const realFetch = globalThis.fetch;
    vi.stubGlobal("fetch", (_url: string, init?: RequestInit) => realFetch(local, init));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const t0 = Date.now();
    try {
      await expect(signUp(makeAuth(200).auth, "j@example.test")).rejects.toMatchObject({ status: "SERVICE_UNAVAILABLE" });
      expect(Date.now() - t0).toBeLessThan(1500);
    } finally {
      server.closeAllConnections();
      server.close();
    }
  });

  it("fails closed when the service answers with an error status", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 503 })));
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(signUp(makeAuth().auth, "d@example.test")).rejects.toMatchObject({ status: "SERVICE_UNAVAILABLE" });
  });

  it("skips non-string passwords and leaves them to the endpoint's validation", async () => {
    const fetch = answer(CLEAN_RANGE);
    vi.stubGlobal("fetch", fetch);
    // Body validation errors carry a numeric status (400), unlike APIError's "BAD_REQUEST".
    await expect(signUp(makeAuth().auth, "e@example.test", 12345678)).rejects.toMatchObject({ status: 400 });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("doesn't check on sign-in", async () => {
    const fetch = answer(CLEAN_RANGE);
    vi.stubGlobal("fetch", fetch);
    const { auth } = makeAuth();
    await signUp(auth, "f@example.test");
    fetch.mockClear();
    await auth.api.signInEmail({ body: { email: "f@example.test", password: SAFE } });
    expect(fetch).not.toHaveBeenCalled();
  });

  // better-auth 1.7.7 consumes the reset token before hashing (better-auth#10632); checking first keeps it usable.
  it("keeps the reset link usable after a refused password or a lookup outage", async () => {
    vi.stubGlobal("fetch", answer(CLEAN_RANGE));
    const { auth, resetToken } = makeAuth(100);
    await signUp(auth, "g@example.test");
    await auth.api.requestPasswordReset({ body: { email: "g@example.test", redirectTo: "/" } });
    const token = resetToken();
    expect(token).not.toBe("");

    vi.stubGlobal("fetch", answer(BREACHED_RANGE));
    await expect(auth.api.resetPassword({ body: { token, newPassword: BREACHED } })).rejects.toMatchObject({ status: "BAD_REQUEST" });

    vi.stubGlobal("fetch", hang().fn);
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(auth.api.resetPassword({ body: { token, newPassword: "another-unlisted-password-42" } })).rejects.toMatchObject({
      status: "SERVICE_UNAVAILABLE",
    });

    vi.stubGlobal("fetch", answer(CLEAN_RANGE));
    await expect(auth.api.resetPassword({ body: { token, newPassword: "another-unlisted-password-42" } })).resolves.toMatchObject({ status: true });
  });
});

describe("pwnedPasswordCheck and sessions", () => {
  it("skips the lookup for a signed-out request to a session-gated route, which the endpoint refuses with 401", async () => {
    const fetch = answer(BREACHED_RANGE);
    vi.stubGlobal("fetch", fetch);
    const { auth } = makeAuth();
    expect((await post(auth, "/change-password", { newPassword: BREACHED, currentPassword: SAFE })).status).toBe(401);
    expect((await post(auth, "/admin/set-user-password", { userId: "u1", newPassword: BREACHED })).status).toBe(401);
    expect((await post(auth, "/admin/create-user", { email: "x@example.test", password: BREACHED, name: "X" })).status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("still checks a signed-in password change", async () => {
    vi.stubGlobal("fetch", answer(CLEAN_RANGE));
    const { auth } = makeAuth();
    const cookie = await signedIn(auth, "k@example.test");
    const fetch = answer(BREACHED_RANGE);
    vi.stubGlobal("fetch", fetch);
    const res = await post(auth, "/change-password", { newPassword: BREACHED, currentPassword: SAFE }, cookie);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "PASSWORD_COMPROMISED" });
    expect(fetch).toHaveBeenCalledOnce();
  });

  // Context changes from before hooks (e.g. headers a bearer-style plugin derives) apply only after all of them have
  // run (better-auth 1.7.7 api/dispatch.mjs), so the check can see no session where the endpoint sees one. It must
  // refuse then, not skip the check.
  it("refuses, rather than skips the check, when it sees no session but the endpoint would", async () => {
    vi.stubGlobal("fetch", answer(CLEAN_RANGE));
    let cookie = "";
    const lateCookie: BetterAuthPlugin = {
      id: "late-cookie",
      hooks: {
        before: [{ matcher: (ctx) => ctx.path === "/change-password", handler: createAuthMiddleware(async () => ({ context: { headers: new Headers({ cookie }) } })) }],
      },
    };
    const { auth } = makeAuth(200, [lateCookie]);
    cookie = await signedIn(auth, "o@example.test");
    const fetch = answer(BREACHED_RANGE);
    vi.stubGlobal("fetch", fetch);
    expect((await post(auth, "/change-password", { newPassword: BREACHED, currentPassword: SAFE })).status).toBe(401);
  });

  // The check's own session read must not refresh the session: the refresh's Set-Cookie would be lost (the
  // endpoint's response headers replace the hook's), leaving the browser cookie on its old expiry.
  it("leaves the session refresh, and its cookie, to the endpoint", async () => {
    vi.stubGlobal("fetch", answer(CLEAN_RANGE));
    const { auth, db } = makeAuth();
    const cookie = await signedIn(auth, "p@example.test");
    // Due for refresh: expiresIn is 7 days and updateAge 1 day, so a session expiring in 5 days was refreshed 2 days ago.
    for (const s of db.session as { expiresAt: Date }[]) s.expiresAt = new Date(Date.now() + 5 * 86_400_000);
    const res = await post(auth, "/change-password", { newPassword: "another-unlisted-password-42", currentPassword: SAFE }, cookie);
    expect(res.status).toBe(200);
    expect(res.headers.getSetCookie().some((c) => c.startsWith("better-auth.session_token="))).toBe(true);
  });

  it("still checks server-side calls, which /admin/create-user accepts without a session", async () => {
    vi.stubGlobal("fetch", answer(BREACHED_RANGE));
    await expect(makeAuth().auth.api.createUser({ body: { email: "l@example.test", password: BREACHED, name: "L" } })).rejects.toMatchObject({
      body: { code: "PASSWORD_COMPROMISED" },
    });
  });
});

describe("pwnedPasswordCheck and length limits", () => {
  // The lower bound itself is still looked up: BREACHED ("password") is exactly 8 characters.
  it("reports a too-short or too-long password as such, without a lookup", async () => {
    const fetch = answer(BREACHED_RANGE);
    vi.stubGlobal("fetch", fetch);
    const { auth } = makeAuth();
    await expect(signUp(auth, "m@example.test", "pass")).rejects.toMatchObject({ body: { code: "PASSWORD_TOO_SHORT" } });
    await expect(signUp(auth, "m@example.test", "p".repeat(129))).rejects.toMatchObject({ body: { code: "PASSWORD_TOO_LONG" } });
    expect(fetch).not.toHaveBeenCalled();
  });

  // better-auth 1.7.7's /admin/create-user checks only the maximum; the hook applies the minimum there too.
  it("refuses a too-short password on /admin/create-user", async () => {
    const fetch = answer(CLEAN_RANGE);
    vi.stubGlobal("fetch", fetch);
    await expect(makeAuth().auth.api.createUser({ body: { email: "n@example.test", password: "pass", name: "N" } })).rejects.toMatchObject({
      body: { code: "PASSWORD_TOO_SHORT" },
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});
