import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import * as Sentry from "@sentry/node";
import { afterAll, expect, it } from "vitest";
import { configureSentry } from "../src/lib/sentry";

// Local stand-ins for Sentry ingest: each records the envelope paths it receives.
const sinks: Server[] = [];
async function sink() {
  const hits: string[] = [];
  const server = createServer((req, res) => {
    hits.push(req.url!);
    req.resume();
    res.end("{}");
  });
  sinks.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { hits, dsn: `http://key@127.0.0.1:${(server.address() as AddressInfo).port}/1` };
}
afterAll(() => sinks.forEach((s) => s.close()));

it("sends errors to the current DSN, nothing while off, and follows a DSN change", async () => {
  const a = await sink();
  const b = await sink();

  configureSentry(a.dsn);
  Sentry.captureException(new Error("on"));
  await Sentry.flush(2000);
  expect(a.hits).toHaveLength(1);
  expect(a.hits[0]).toMatch(/^\/api\/1\/envelope\//);

  configureSentry(null);
  Sentry.captureException(new Error("off"));
  await Sentry.flush(2000);
  expect(a.hits).toHaveLength(1);

  configureSentry(b.dsn);
  Sentry.captureException(new Error("moved"));
  await Sentry.flush(2000);
  expect(a.hits).toHaveLength(1);
  expect(b.hits).toHaveLength(1);
});
