import * as Sentry from "@sentry/node";

// Server error reporting, configured on /admin. OpenTelemetry (otel.mjs) owns tracing, so Sentry only
// receives errors, tagged with the active trace id.
let activeDsn: string | null = null;

// Called whenever site settings are (re)loaded: a DSN change re-initialises Sentry on this replica.
export async function configureSentry(dsn: string | null): Promise<void> {
  if (dsn === activeDsn) return;
  activeDsn = dsn;
  await Sentry.getClient()?.close(2000);
  if (!dsn) return;
  Sentry.init({
    dsn,
    // No tracesSampleRate: errors only. OpenTelemetry already hooks the module loader.
    enableRuntimeChannelInjection: false,
    integrations: [Sentry.openTelemetryIntegration()],
  });
}

// Path only: query strings can carry tokens (e.g. /reset-password?token=…).
export function captureServerError(error: unknown, request: Request): void {
  if (activeDsn) Sentry.captureException(error, { extra: { method: request.method, path: new URL(request.url).pathname } });
}
