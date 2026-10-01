import { makeMultiplexedTransport } from "@sentry/core";
import * as Sentry from "@sentry/node";

// Server error reporting, configured on /admin. OpenTelemetry (otel.mjs) owns tracing, so Sentry only
// receives errors, tagged with the active trace id.

// Where server errors go: the DSN from /admin, or null while server reporting is switched off.
let activeDsn: string | null = null;

// Called whenever site settings are (re)loaded. Sentry's options are fixed when the client is created, and a
// second Sentry.init (inside a request) binds only to that request's scope and adds another set of process
// handlers. So the client is created once, with the first DSN, and the multiplexed transport sends each event
// to the DSN current at send time: the approach Sentry's maintainers recommend for changing a DSN.
export function configureSentry(dsn: string | null): void {
  activeDsn = dsn;
  if (!dsn || Sentry.getClient()) return;
  Sentry.init({
    dsn,
    // The image's commit SHA (set by the AppHost); stack traces resolve through debug IDs either way.
    release: process.env.SENTRY_RELEASE || undefined,
    // No tracesSampleRate: errors only. OpenTelemetry already hooks the module loader.
    enableRuntimeChannelInjection: false,
    integrations: [Sentry.openTelemetryIntegration()],
    transport: makeMultiplexedTransport(Sentry.makeNodeTransport, () => (activeDsn ? [activeDsn] : [])),
    // Switched off on /admin: drop every event, including the SDK's own uncaught-exception reports.
    beforeSend: (event) => (activeDsn ? event : null),
  });
}

// Path only: query strings can carry tokens (e.g. /reset-password?token=…).
export function captureServerError(error: unknown, request: Request): void {
  if (activeDsn) Sentry.captureException(error, { extra: { method: request.method, path: new URL(request.url).pathname } });
}
