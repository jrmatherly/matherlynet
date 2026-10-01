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
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      envelopes.push(body.split("\n").flatMap((line) => (line.includes('"type"') ? [JSON.parse(line).type] : [])));
      res.end("{}");
    });
  });
  sinks.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const events = () => envelopes.filter((types) => types.includes("event")).length;
  return { envelopes, events, dsn: `http://key@127.0.0.1:${(server.address() as AddressInfo).port}/1` };
}
afterAll(() => sinks.forEach((s) => s.close()));

it("sends errors to the current DSN, nothing at all while off, and follows a DSN change", async () => {
  const a = await sink();
  const b = await sink();

  configureSentry(a.dsn);
  Sentry.captureException(new Error("on"));
  await Sentry.flush(2000);
  expect(a.events()).toBe(1);

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

it("connects directly even when a proxy is configured, so the lookup check always applies", async () => {
  const d = await sink();
  // Nothing listens on port 9: through Sentry's proxy agent this event would be lost.
  vi.stubEnv("http_proxy", "http://127.0.0.1:9");
  configureSentry(d.dsn);
  Sentry.captureException(new Error("direct"));
  await Sentry.flush(2000);
  vi.unstubAllEnvs();
  expect(d.events()).toBe(1);
});
