import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import * as Sentry from "@sentry/node";
import { afterAll, expect, it, vi } from "vitest";
import { configureSentry } from "../src/lib/sentry";

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
  // first envelope lands, and @sentry/node 11.7.0 then closes the process session (processSessionIntegration) and
  // queues its "exited" update. That send is in the buffer before the flush above resolves but not awaited by it, so a
  // second flush takes it before the switch to off.
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
