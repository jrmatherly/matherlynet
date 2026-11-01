import { AsyncResource } from "node:async_hooks";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { inspect } from "node:util";
import * as Sentry from "@sentry/node";
import { sql } from "drizzle-orm";
import { DrizzleQueryError } from "drizzle-orm/errors";
import { afterAll, expect, it, vi } from "vitest";
import { captureError, captureServerError, configureSentry } from "../src/lib/sentry";

// Local stand-ins for Sentry ingest: each records the item types of every envelope it receives. Besides error
// events the SDK sends a `session` envelope when it knows a release (it reads one from env such as GITHUB_SHA in
// CI), so assertions count events, and "off" means no envelope of any kind.
const sinks: Server[] = [];
async function sink() {
  const envelopes: string[][] = [];
  const bodies: Record<string, unknown>[] = [];
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      const lines = body.split("\n");
      envelopes.push(lines.flatMap((line) => (line.includes('"type"') ? [JSON.parse(line).type] : [])));
      // An event's body is the line after its item header.
      lines.forEach((line, i) => {
        if (line.includes('"type":"event"')) bodies.push(JSON.parse(lines[i + 1]));
      });
      res.end("{}");
    });
  });
  sinks.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const events = () => envelopes.filter((types) => types.includes("event")).length;
  return { envelopes, events, bodies, dsn: `http://key@127.0.0.1:${(server.address() as AddressInfo).port}/1` };
}
afterAll(() => sinks.forEach((s) => s.close()));

it("sends errors to the current DSN, nothing at all while off, and follows a DSN change", async () => {
  const a = await sink();
  const b = await sink();

  configureSentry(a.dsn);
  Sentry.captureException(new Error("on"));
  await Sentry.flush(2000);
  expect(a.events()).toBe(1);
  // The sink is an http server in this process, so Sentry's server instrumentation starts a request session when the
  // first envelope lands, and @sentry/node then closes the process session (processSessionIntegration;
  // checked on @sentry/node 11.9.0) and queues its "exited" update. That send is in the buffer before the flush above
  // resolves but not awaited by it, so a second flush takes it before the switch to off.
  await Sentry.flush(2000);

  const sentWhileOn = a.envelopes.length;
  configureSentry(null);
  Sentry.captureException(new Error("off"));
  await Sentry.flush(2000);
  expect(a.envelopes).toHaveLength(sentWhileOn);
  expect(b.envelopes).toHaveLength(0);

  configureSentry(b.dsn);
  Sentry.captureException(new Error("moved"));
  await Sentry.flush(2000);
  expect(a.events()).toBe(1);
  expect(b.events()).toBe(1);
});

it("sends nothing to a DSN whose name resolves to a private address", async () => {
  const c = await sink();
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  // localhost resolves to ::1 / 127.0.0.1 (the sink listens on 127.0.0.1); IP literals skip the lookup.
  configureSentry(c.dsn.replace("127.0.0.1", "localhost"));
  Sentry.captureException(new Error("private"));
  await Sentry.flush(2000);
  expect(c.envelopes).toHaveLength(0);
  expect(log.mock.calls.flat().join(" ")).toMatch(/private address/);
  log.mockRestore();
});

// Real DSNs are https: the https branch must carry the lookup too. It refuses before connecting, so no TLS sink.
it("refuses a private https DSN as well", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  configureSentry("https://key@localhost:9/1");
  Sentry.captureException(new Error("private https"));
  await Sentry.flush(2000);
  expect(log.mock.calls.flat().join(" ")).toMatch(/localhost resolves to private address/);
  log.mockRestore();
});

it("connects directly even when a proxy is configured, and says so", async () => {
  const d = await sink();
  // Nothing listens on port 9: through Sentry's proxy agent this event would be lost. no_proxy is cleared so an
  // exemption in the environment can't make this pass without the direct agents.
  vi.stubEnv("http_proxy", "http://127.0.0.1:9");
  vi.stubEnv("no_proxy", "");
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    configureSentry(d.dsn);
    Sentry.captureException(new Error("direct"));
    await Sentry.flush(2000);
  } finally {
    vi.unstubAllEnvs();
  }
  expect(d.events()).toBe(1);
  expect(warn.mock.calls.flat().join(" ")).toMatch(/proxy is set, but server Sentry connects directly/);
  warn.mockRestore();
});

it("sends no reset token or other secret from a failed request, anywhere in the event", async () => {
  const { dsn, bodies } = await sink();
  configureSentry(dsn);
  const app = createServer((req, res) => {
    captureServerError(new Error("database down"), new Request(`http://matherly.net${req.url}`, { method: req.method }));
    res.statusCode = 500;
    res.end();
  });
  sinks.push(app);
  await new Promise<void>((resolve) => app.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(app.address() as AddressInfo).port}`;
  await fetch(`${url}/api/auth/reset-password/SECRET1?token=SECRET2&code=SECRET3&callbackURL=/`, {
    headers: { referer: `${url}/reset-password?token=SECRET4`, authorization: "Bearer SECRET5", cookie: "session=SECRET6" },
  });
  await Sentry.flush(2000);

  expect(bodies).toHaveLength(1);
  expect(JSON.stringify(bodies[0])).not.toMatch(/SECRET/);
  const event = bodies[0] as { extra?: { path?: string }; request?: { url?: string } };
  expect(event.extra?.path).toBe("/api/auth/reset-password/REDACTED");
  expect(event.request?.url).toContain("/api/auth/reset-password/REDACTED");
});

it("sends no request body: a sign-up's email and password stay out of the event", async () => {
  const { dsn, bodies } = await sink();
  configureSentry(dsn);
  const app = createServer((req, res) => {
    // A listener, not req.resume(): with resume() the test still passes when httpBodies is removed.
    req.on("data", () => {});
    // Bound, or the callback leaves the request's scope and the event has no `request` to check.
    req.on(
      "end",
      AsyncResource.bind(() => {
        captureServerError(new Error("sign-up failed"), new Request(`http://matherly.net${req.url}`, { method: req.method }));
        res.statusCode = 500;
        res.end();
      }),
    );
  });
  sinks.push(app);
  await new Promise<void>((resolve) => app.listen(0, "127.0.0.1", resolve));
  const secret = crypto.randomUUID();
  await fetch(`http://127.0.0.1:${(app.address() as AddressInfo).port}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: `${secret}@example.test`, password: secret }),
  });
  await Sentry.flush(2000);

  expect(bodies).toHaveLength(1);
  expect((bodies[0] as { request?: { method?: string } }).request?.method).toBe("POST");
  expect(JSON.stringify(bodies[0])).not.toContain(secret);
});

it("keeps a failed query's text but not its parameters, in the error, a log line and the event", async () => {
  const { dsn, bodies } = await sink();
  configureSentry(dsn);
  // Nothing listens on port 9, so this is a real failed query through the app's own db module.
  vi.stubEnv("APPDB_URI", "postgresql://u:p@127.0.0.1:9/x");
  const { db } = await import("../src/db");
  vi.unstubAllEnvs();
  // Random, not a literal: Sentry sends the source lines around each stack frame, and a literal would be on one.
  const secret = crypto.randomUUID();
  // Node formats a stack on first read. Reading it as the error is made pins the case where something reads it early.
  const capture = Error.captureStackTrace;
  const earlyRead = vi.spyOn(Error, "captureStackTrace").mockImplementation((target, fn) => {
    capture(target, fn);
    void (target as Error).stack;
  });
  const failed: unknown = await db.execute(sql`select ${secret}`).then(
    () => null,
    (error: unknown) => error,
  );
  expect(earlyRead.mock.calls.some(([target]) => target === failed)).toBe(true);
  earlyRead.mockRestore();

  expect(failed).toBeInstanceOf(DrizzleQueryError);
  // inspect is what a logger prints: the message, the stack and every property.
  expect(inspect(failed, { depth: null })).not.toContain(secret);
  expect(inspect(failed, { depth: null })).toContain("Failed query: select");
  expect(inspect(failed, { depth: null })).toContain("ECONNREFUSED");

  // Not mocked: a spy replaces Sentry's console wrapper, and no breadcrumb would be recorded.
  console.error("auth request failed", failed);
  captureError(failed);
  await Sentry.flush(2000);
  expect(bodies).toHaveLength(1);
  expect(JSON.stringify(bodies[0])).not.toContain(secret);
  expect(JSON.stringify(bodies[0])).toContain("Failed query: select");
});

it("removes the column values Postgres puts on a failed query's cause, and keeps its code and message", async () => {
  vi.stubEnv("APPDB_URI", "postgresql://u:p@127.0.0.1:9/x");
  const { db } = await import("../src/db");
  vi.unstubAllEnvs();
  const secret = crypto.randomUUID();
  const violation = Object.assign(new Error('duplicate key value violates unique constraint "user_email_unique"'), {
    code: "23505",
    detail: `Key (email)=(${secret}) already exists.`,
    where: `where ${secret}`,
    hint: `hint ${secret}`,
    internalQuery: `select ${secret}`,
  });
  const query = vi.spyOn(db.$client, "query").mockImplementation(() => Promise.reject(violation) as never);
  const failed: unknown = await db.execute(sql`select 1`).then(
    () => null,
    (error: unknown) => error,
  );
  query.mockRestore();

  expect(inspect(failed, { depth: null })).not.toContain(secret);
  expect(inspect(failed, { depth: null })).toContain("23505");
  expect(inspect(failed, { depth: null })).toContain("user_email_unique");
});

it("sends no visitor identity: no user.ip_address, no client IP headers, request url and method kept", async () => {
  const { dsn, bodies } = await sink();
  configureSentry(dsn);
  await Sentry.withIsolationScope(async () => {
    Sentry.getIsolationScope().setSDKProcessingMetadata({
      normalizedRequest: {
        url: "https://matherly.net/x",
        method: "GET",
        headers: { "cf-connecting-ip": "203.0.113.9", "user-agent": "t" },
      },
      ipAddress: "203.0.113.9",
    });
    Sentry.captureException(new Error("probe"));
    await Sentry.flush(2000);
  });
  expect(bodies).toHaveLength(1);
  const event = bodies[0] as {
    user?: { ip_address?: string };
    request?: { url?: string; method?: string; headers?: Record<string, string> };
  };
  expect(event.user?.ip_address).toBeUndefined();
  expect(event.request?.headers?.["cf-connecting-ip"]).toBeUndefined();
  expect(event.request).toMatchObject({ url: "https://matherly.net/x", method: "GET" });
});
