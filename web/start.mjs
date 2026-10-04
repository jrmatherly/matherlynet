// Production entry (the image runs `node start.mjs`; `pnpm start` runs it too). Dynamic imports, in order:
// OpenTelemetry's loader hook only patches modules loaded after it registers, and static imports would load the
// whole graph (pg, Astro's server) before otel.mjs runs. One process, so SIGTERM reaches server.mjs's handlers.
await import("./otel.mjs");
await import("./migrate.mjs");
await import("./server.mjs");
