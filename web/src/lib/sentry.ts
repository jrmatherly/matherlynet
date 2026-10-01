import { makeMultiplexedTransport, type Transport } from "@sentry/core";
import * as Sentry from "@sentry/node";

// Server error reporting, configured on /admin. OpenTelemetry (otel.mjs) owns tracing, so Sentry only
// receives errors, tagged with the active trace id.

// Where server errors go: the DSN from /admin, or null while server reporting is switched off.
let activeDsn: string | null = null;

// Every envelope type (errors, sessions, client reports) passes through the transport, so "off" means nothing is
// sent. beforeSend would only see error events, and with no DSN the multiplexer falls back to the init DSN.
export const gateTransport = (inner: Transport, isOn: () => boolean): Transport => ({
  send: (envelope) => (isOn() ? inner.send(envelope) : Promise.resolve({})),
  flush: (timeout) => inner.flush(timeout),
});

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
    transport: (options) =>
      gateTransport(
        makeMultiplexedTransport(Sentry.makeNodeTransport, () => (activeDsn ? [activeDsn] : []))(options),
        () => activeDsn !== null,
      ),
    // Request bodies stay out of events (sign-up bodies carry emails); query strings and headers keep the SDK's
    // default key filtering (token, password, cookie, … are redacted).
    dataCollection: { httpBodies: [] },
  });
}

// Path only: query strings can carry tokens (e.g. /reset-password?token=…).
export function captureServerError(error: unknown, request: Request): void {
  if (activeDsn) Sentry.captureException(error, { extra: { method: request.method, path: new URL(request.url).pathname } });
}
