// Production entry: starts Astro's standalone server ourselves so SIGTERM/SIGINT drain it, flush telemetry and
// exit. @astrojs/node installs no signal handlers (dist/standalone.js); ASTRO_NODE_AUTOSTART and startServer are
// confirmed in its source (dist/server.js), not in its docs: re-check them when upgrading the adapter.
process.env.ASTRO_NODE_AUTOSTART = "disabled";
const { startServer } = await import("./dist/server/entry.mjs");
const Sentry = await import("@sentry/node");
const { server } = startServer();

// Waits for `promise` at most `ms`; a rejection counts as done (shutdown must still exit).
const within = (ms, promise) =>
  Promise.race([Promise.resolve(promise).catch(() => {}), new Promise((resolve) => setTimeout(resolve, ms))]);

let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  // Docker sends SIGKILL 10 s after SIGTERM: drain 7 s, then flush Sentry (1 s) and OpenTelemetry (1.5 s).
  const drained = new Promise((resolve) => server.server.close(resolve));
  server.server.closeIdleConnections();
  await within(7_000, drained);
  await within(1_000, Sentry.close(1_000));
  await within(1_500, globalThis.__otelShutdown?.());
  process.exit(0);
}
process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
