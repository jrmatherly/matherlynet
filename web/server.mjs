// Production entry: starts Astro's standalone server ourselves so SIGTERM/SIGINT drain it, flush telemetry and
// exit. @astrojs/node installs no signal handlers (dist/standalone.js); ASTRO_NODE_AUTOSTART and startServer are
// confirmed in its source (dist/server.js), not in its docs: re-check them when upgrading the adapter.
process.env.ASTRO_NODE_AUTOSTART = "disabled";
const { startServer } = await import("./dist/server/entry.mjs");
const Sentry = await import("@sentry/node");
const { server } = startServer();

// Waits for `promise` at most `ms`, logging a timeout, a rejection or a `false` result (Sentry.close's "not
// flushed"); shutdown goes on either way, since it must finish inside the stop timeout.
async function step(name, ms, promise) {
  let timer;
  const result = await Promise.race([
    Promise.resolve(promise).catch((error) => (console.error(`shutdown: ${name} failed`, error), true)),
    new Promise((resolve) => (timer = setTimeout(resolve, ms, "timeout"))),
  ]);
  clearTimeout(timer);
  if (result === "timeout") console.error(`shutdown: ${name} still running after ${ms} ms`);
  else if (result === false) console.error(`shutdown: ${name} did not finish`);
}

let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  // Docker sends SIGKILL 10 s after SIGTERM: drain 7 s, then flush Sentry (1 s) and OpenTelemetry (1.5 s).
  const drained = new Promise((resolve) => server.server.close(resolve));
  // close() only ends connections idle right now; a keep-alive socket whose response finishes later would stay
  // open until keepAliveTimeout and hold the drain to its 7 s cap. Keep closing idle ones while draining.
  server.server.closeIdleConnections();
  setInterval(() => server.server.closeIdleConnections(), 100).unref();
  await step("HTTP drain", 7_000, drained);
  // Sentry.close resolves false without a client too (reporting off): only flush one that exists.
  await step("Sentry flush", 1_000, Sentry.getClient() ? Sentry.close(1_000) : true);
  await step("OpenTelemetry flush", 1_500, globalThis.__otelShutdown?.());
  process.exit(0);
}
process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
