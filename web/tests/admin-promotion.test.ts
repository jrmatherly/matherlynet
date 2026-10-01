// Admin promotion through real better-auth: memoryAdapter in place of Drizzle, the real emailed link through
// auth.handler, the Have I Been Pwned lookup stubbed. Exercises the hooks the way better-auth actually calls them.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const ADMIN = "owner@example.test";
const PASSWORD = "a-long-unpwned-test-password-91";

const h = vi.hoisted(() => ({
  mem: { user: [], session: [], account: [], verification: [], rateLimit: [] } as Record<string, Record<string, unknown>[]>,
  mails: [] as { to: string; body: string }[],
  failPromotion: false,
  dbDown: false,
  sessionInsertFails: false,
}));

// promoteAdmin's `db.update(user).set({ role }).where(eq(user.id, id))`, applied to the memory store.
vi.mock("drizzle-orm", async (orig) => ({ ...(await orig<object>()), eq: (_col: unknown, id: unknown) => ({ id }) }));
vi.mock("../src/db", () => ({
  db: {
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: async ({ id }: { id: string }) => {
          if (h.failPromotion) throw new Error("connection terminated unexpectedly");
          for (const u of h.mem.user) if (u.id === id) Object.assign(u, values);
        },
      }),
    }),
  },
}));
vi.mock("better-auth/adapters/drizzle", async () => {
  const { memoryAdapter } = await import("better-auth/adapters/memory");
  // h.dbDown makes reads fail like an unreachable Postgres.
  const adapter = memoryAdapter(h.mem);
  return {
    drizzleAdapter: () => (options: never) => {
      const a = adapter(options);
      return {
        ...a,
        // h.sessionInsertFails makes session inserts come back empty, which better-auth turns into a 500 inside the
        // endpoint (the after hook's path, unlike a thrown adapter error, which escapes to onAPIError).
        create: (...args: Parameters<typeof a.create>) =>
          h.sessionInsertFails && args[0].model === "session" ? Promise.resolve(null as never) : a.create(...args),
        findOne: (...args: Parameters<typeof a.findOne>) =>
          h.dbDown ? Promise.reject(new Error("connect ECONNREFUSED")) : a.findOne(...args),
      };
    },
  };
});
vi.mock("../src/lib/mail", () => ({
  sendMail: vi.fn(async (to: string, _subject: string, body: string) => void h.mails.push({ to, body })),
}));
vi.mock("../src/lib/sentry", async (orig) => ({ ...(await orig<object>()), captureError: vi.fn() }));

type Auth = { handler: (r: Request) => Promise<Response>; api: Record<string, (arg: object) => Promise<unknown>> };
let auth: Auth;
const owner = () => h.mem.user.find((u) => u.email === ADMIN)!;
const link = (to: string) => new URL(h.mails.filter((m) => m.to === to).at(-1)!.body.match(/https?:\/\/\S+/)![0]);
const signIn = async (email: string) => {
  const { headers } = (await auth.api.signInEmail({ body: { email, password: PASSWORD } as never, returnHeaders: true } as never)) as {
    headers: Headers;
  };
  return new Headers({ cookie: headers.getSetCookie().map((c) => c.split(";")[0]).join("; ") });
};
const signUpAndVerify = async (email: string) => {
  await auth.api.signUpEmail({ body: { email, password: PASSWORD, name: "T" } as never });
  return auth.handler(new Request(link(email)));
};
const captureError = async () =>
  ((await import("../src/lib/sentry")) as unknown as { captureError: ReturnType<typeof vi.fn> }).captureError;

beforeAll(async () => {
  vi.stubEnv("ADMIN_EMAIL", ADMIN);
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:4321");
  vi.stubEnv("BETTER_AUTH_SECRET", "test-secret-test-secret-test-secret-123");
  // Have I Been Pwned range lookup: an empty body means not compromised.
  vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 200 })));
  ({ auth } = (await import("../src/lib/auth")) as unknown as { auth: Auth });
});
afterAll(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("admin promotion", () => {
  it("the emailed link verifies and promotes the admin-email account", async () => {
    const res = await signUpAndVerify(ADMIN);
    expect(res.status).toBeLessThan(400);
    expect(owner()).toMatchObject({ emailVerified: true, role: "admin" });
  });

  it("an ordinary update (name change) after a demotion doesn't re-promote", async () => {
    owner().role = "user"; // demoted, as /admin/set-role does
    const headers = await signIn(ADMIN);
    await auth.api.updateUser({ body: { name: "Renamed" } as never, headers } as never);
    expect(owner()).toMatchObject({ name: "Renamed", role: "user" });
  });

  it("a user can't send emailVerified through /update-user", async () => {
    const headers = await signIn(ADMIN);
    await expect(auth.api.updateUser({ body: { emailVerified: true } as never, headers } as never)).rejects.toThrow();
    expect(owner().role).toBe("user");
  });

  it("an admin setting emailVerified through /admin/update-user isn't a verification: no promotion", async () => {
    await signUpAndVerify("other-admin@example.test");
    h.mem.user.find((u) => u.email === "other-admin@example.test")!.role = "admin";
    const headers = await signIn("other-admin@example.test");
    await auth.api.adminUpdateUser({ body: { userId: owner().id, data: { emailVerified: true } } as never, headers } as never);
    expect(owner().role).toBe("user");
  });

  it("if the promotion UPDATE fails, the link still verifies and signs in, and the failure is reported", async () => {
    const email = "owner2@example.test";
    vi.stubEnv("ADMIN_EMAIL", email); // read at module load: a fresh module below
    vi.resetModules();
    h.failPromotion = true;
    const fresh = (await import("../src/lib/auth")) as unknown as { auth: Auth };
    vi.spyOn(console, "error").mockImplementation(() => {});
    await fresh.auth.api.signUpEmail({ body: { email, password: PASSWORD, name: "T" } as never });
    const res = await fresh.auth.handler(new Request(link(email)));
    h.failPromotion = false;
    expect(h.mem.user.find((u) => u.email === email)).toMatchObject({ emailVerified: true, role: "user" });
    expect(res.status).toBeLessThan(500);
    expect(res.headers.getSetCookie().some((c) => c.startsWith("better-auth.session_token="))).toBe(true);
    expect(await captureError()).toHaveBeenCalled();
  });

  it("a failed breached-password lookup (Have I Been Pwned answers 500) is reported to Sentry", async () => {
    const capture = await captureError();
    capture.mockClear();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 500 })));
    const { auth: a } = (await import("../src/lib/auth")) as unknown as { auth: Auth };
    const res = await a.handler(
      new Request("http://localhost:4321/api/auth/sign-up/email", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost:4321" },
        body: JSON.stringify({ email: "f4@example.test", password: PASSWORD, name: "T" }),
      }),
    );
    expect(res.status).toBe(503);
    expect(capture).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 503 }));
  });

  it("a 5xx APIError thrown inside an endpoint (failed session insert) is reported with its path", async () => {
    const capture = await captureError();
    capture.mockClear();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 200 })));
    await auth.api.signUpEmail({ body: { email: "f5@example.test", password: PASSWORD, name: "T" } as never });
    h.sessionInsertFails = true;
    const res = await auth.handler(new Request(link("f5@example.test")));
    h.sessionInsertFails = false;
    expect(res.status).toBe(500);
    // Only the after hook passes { path }: this pins that path, not onAPIError's.
    expect(capture).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 500 }), { path: "/verify-email" });
  });

  it("a crash that escapes an endpoint (database down) is logged and reported to Sentry", async () => {
    const capture = await captureError();
    capture.mockClear();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    h.dbDown = true;
    const res = await auth.handler(
      new Request("http://localhost:4321/api/auth/sign-in/email", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost:4321" },
        body: JSON.stringify({ email: ADMIN, password: PASSWORD }),
      }),
    );
    h.dbDown = false;
    expect(res.status).toBe(500);
    expect(capture).toHaveBeenCalledWith(expect.objectContaining({ message: "connect ECONNREFUSED" }));
    expect(log).toHaveBeenCalled();
  });
});
