// The per-recipient mail throttle through real better-auth: memoryAdapter in place of Drizzle, mail captured, and
// db.execute answering the throttle's upsert from an in-memory window per recipient key (the SQL itself is checked
// against Postgres, not here).
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const PASSWORD = "a-long-unpwned-test-password-91";
const CLEAN_RANGE = "0018A45C4D1DEF81644B54AB7F969B88D65:0\r\n";
const ORIGIN = "http://localhost:4321";

const h = vi.hoisted(() => ({
  mem: { user: [], session: [], account: [], verification: [], rateLimit: [] } as Record<string, Record<string, unknown>[]>,
  mails: [] as { to: string; subject: string }[],
  counts: new Map<string, number>(),
  dbDown: false,
}));

vi.mock("../src/db", () => ({
  db: {
    execute: async (query: SQL) => {
      if (h.dbDown) throw new Error("connect ECONNREFUSED");
      const key = new PgDialect().sqlToQuery(query).params.find((p) => typeof p === "string" && /^[0-9a-f]{64}$/.test(p));
      if (typeof key !== "string") throw new Error("no recipient key in the query");
      const count = (h.counts.get(key) ?? 0) + 1;
      h.counts.set(key, count);
      return { rows: [{ count }] };
    },
  },
}));
vi.mock("better-auth/adapters/drizzle", async () => {
  const { memoryAdapter } = await import("better-auth/adapters/memory");
  return { drizzleAdapter: () => memoryAdapter(h.mem) };
});
vi.mock("../src/lib/mail", () => ({
  sendMail: vi.fn((to: string, subject: string) => void h.mails.push({ to, subject })),
}));
vi.mock("../src/lib/sentry", async (orig) => ({ ...(await orig<object>()), captureError: vi.fn() }));

type Auth = { handler: (r: Request) => Promise<Response>; api: Record<string, (arg: object) => Promise<unknown>> };
let auth: Auth;

// The throttle runs detached from the response: let its promise chain finish before counting mails.
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const post = (path: string, body: object) =>
  auth.handler(
    new Request(`${ORIGIN}/api/auth${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN },
      body: JSON.stringify(body),
    }),
  );
const signIn = async (email: string) => {
  const res = await post("/sign-in/email", { email, password: PASSWORD });
  await settle();
  return res;
};
const mailsTo = (to: string) => h.mails.filter((m) => m.to === to).length;
// Signs up (one verification mail), then starts a new window, as an hour later would.
const unverified = async (email: string) => {
  await auth.api.signUpEmail({ body: { email, password: PASSWORD, name: "T" } as never });
  await settle();
  h.counts.clear();
  h.mails.length = 0;
};

beforeAll(async () => {
  vi.stubEnv("BETTER_AUTH_URL", ORIGIN);
  vi.stubEnv("BETTER_AUTH_SECRET", "test-secret-test-secret-test-secret-123");
  vi.stubGlobal("fetch", vi.fn(async () => new Response(CLEAN_RANGE, { status: 200 })));
  ({ auth } = (await import("../src/lib/auth")) as unknown as { auth: Auth });
});
beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterAll(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("mail throttle", () => {
  it("six sign-ins to an unverified account send five verification mails, then none", async () => {
    const email = "flooded@example.test";
    await unverified(email);
    const sent: number[] = [];
    for (let i = 0; i < 6; i++) {
      expect((await signIn(email)).status).toBe(403);
      sent.push(mailsTo(email));
    }
    expect(sent).toEqual([1, 2, 3, 4, 5, 5]);
    expect(h.mails.every((m) => m.subject === "Verify your email")).toBe(true);
  });

  it("another address keeps its own count", async () => {
    const email = "neighbour@example.test";
    await auth.api.signUpEmail({ body: { email, password: PASSWORD, name: "T" } as never });
    await settle();
    expect(mailsTo(email)).toBe(1);
    await signIn(email);
    expect(mailsTo(email)).toBe(2);
    await signIn("flooded@example.test");
    expect(mailsTo("flooded@example.test")).toBe(5);
  });

  it("when the database fails, no mail is sent and the response is the same", async () => {
    const email = "dbdown@example.test";
    await unverified(email);
    const allowed = await signIn(email);
    expect(mailsTo(email)).toBe(1);
    h.dbDown = true;
    const failed = await signIn(email).finally(() => (h.dbDown = false));
    expect(mailsTo(email)).toBe(1);
    expect(failed.status).toBe(allowed.status);
    expect(await failed.json()).toEqual(await allowed.json());
  });

  it("a throttled password reset answers exactly like an allowed one", async () => {
    const fresh = "reset-ok@example.test";
    await unverified(fresh);
    const allowed = await post("/request-password-reset", { email: fresh });
    await settle();
    expect(h.mails.filter((m) => m.to === fresh && m.subject === "Reset your password")).toHaveLength(1);

    const flooded = "reset-flooded@example.test";
    await unverified(flooded);
    for (let i = 0; i < 5; i++) await signIn(flooded);
    expect(mailsTo(flooded)).toBe(5);
    const throttled = await post("/request-password-reset", { email: flooded });
    await settle();
    expect(mailsTo(flooded)).toBe(5);

    expect(throttled.status).toBe(allowed.status);
    expect(await throttled.json()).toEqual(await allowed.json());
  });
});
