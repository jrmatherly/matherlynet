// Production entry (the image runs `node start.mjs`; `pnpm start` runs it too). Dynamic imports, in order:
// OpenTelemetry's loader hook only patches modules loaded after it registers, and static imports would load
// migrate.mjs's pg and drizzle before otel.mjs runs (server.mjs imports its own graph dynamically). One process, so
// SIGTERM reaches server.mjs's handlers.
// Node runs as PID 1 in the container, where a signal with no handler is dropped: until server.mjs installs its
// drain, a stop (say, during migrate.mjs's wait for Postgres) exits here at once instead of waiting for SIGKILL.
const early = { SIGTERM: () => process.exit(143), SIGINT: () => process.exit(130) };
for (const [signal, exit] of Object.entries(early)) process.on(signal, exit);
await import("./otel.mjs");
await import("./migrate.mjs");
await import("./server.mjs");
for (const [signal, exit] of Object.entries(early)) process.off(signal, exit);
