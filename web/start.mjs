// Production entry (the image runs `node start.mjs`; `pnpm start` runs it too). Dynamic imports, in order:
// OpenTelemetry's loader hook only patches modules loaded after it registers, and static imports would load
// migrate.mjs's pg and drizzle before otel.mjs runs (server.mjs imports its own graph dynamically). One process, so
// SIGTERM reaches server.mjs's handlers.
// Node runs as PID 1 in the container, where a signal with no handler is dropped: until server.mjs installs its
// drain, a stop (say, during migrate.mjs's wait for Postgres) exits here at once instead of waiting for SIGKILL.
// nodemailer (10.0.13) takes a string that is not an smtp: or smtps: URL as a transport object and throws when
// src/lib/mail.ts loads, which is on the first auth request: the server starts and then fails every probe. The value
// can hold a password, so the message does not print it. The pattern is nodemailer's own, without `direct:`.
const smtp = process.env.SMTP_URL;
if (smtp && !(/^smtps?:/i.test(smtp) && URL.parse(smtp)?.hostname)) {
  console.error(
    "start: SMTP_URL is not an smtp:// or smtps:// URL, for example smtps://user:password@smtp.example.com:465. " +
      "Leave it unset to run without mail.",
  );
  process.exit(1);
}

const early = { SIGTERM: () => process.exit(143), SIGINT: () => process.exit(130) };
for (const [signal, exit] of Object.entries(early)) process.on(signal, exit);
await import("./otel.mjs");
await import("./migrate.mjs");
await import("./server.mjs");
for (const [signal, exit] of Object.entries(early)) process.off(signal, exit);
