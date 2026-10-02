import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import type { LookupFunction } from "node:net";
import { makeMultiplexedTransport, type Transport } from "@sentry/core";
import * as Sentry from "@sentry/node";
import { isPrivateAddress } from "./settings-form";

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

// /admin refuses private IP literals in the DSN; a DNS name is checked here, on every new connection, against every
// address it resolves to, so a name that points into the local network (now or after a DNS change) is refused (SSRF).
export const publicOnlyLookup =
  (lookup: typeof dns.lookup = dns.lookup): LookupFunction =>
  (hostname, options, callback) =>
    lookup(hostname, { ...options, all: true as const }, (err, addresses) => {
      // Logged here: Sentry's transport drops a failed send with no output outside debug builds.
      if (err) {
        console.error(`sentry: lookup of ${hostname} failed (${err.code ?? err.message}); envelope not sent`);
        return callback(err, "");
      }
      const blocked = addresses.find((a) => isPrivateAddress(a.address));
      if (blocked) {
        console.error(`sentry: ${hostname} resolves to private address ${blocked.address}; envelope not sent`);
        return callback(Object.assign(new Error(`${hostname} resolves to a private address`), { code: "EPRIVATEADDR" }), "");
      }
      if (options.all) return callback(null, addresses);
      callback(null, addresses[0].address, addresses[0].family);
    });

// Sentry's Node transport with publicOnlyLookup on every request (its httpModule option). Our own agents (Sentry's
// defaults: keep-alive, 30 sockets, 2 s socket timeout) replace the one it passes, which is a CONNECT proxy agent
// when a proxy is configured (http(s)_proxy): the proxy would resolve the DSN name itself and the lookup would never
// run. So server Sentry always connects directly, and says so when a proxy is set (events fail if egress needs it).
const lookup = publicOnlyLookup();
const agents = {
  http: new http.Agent({ keepAlive: true, maxSockets: 30, timeout: 2_000 }),
  https: new https.Agent({ keepAlive: true, maxSockets: 30, timeout: 2_000 }),
};
const publicOnlyHttp = {
  request: (options: http.RequestOptions, callback?: (res: http.IncomingMessage) => void) =>
    options.protocol === "http:"
      ? http.request({ ...options, agent: agents.http, lookup }, callback)
      : https.request({ ...options, agent: agents.https, lookup }, callback),
};
// One transport per DSN (the multiplexer caches them), so this warns once per DSN, not per event.
const publicOnlyTransport = (options: Parameters<typeof Sentry.makeNodeTransport>[0]) => {
  const proxy = process.env.https_proxy || process.env.http_proxy;
  if (proxy) console.warn("sentry: http(s)_proxy is set, but server Sentry connects directly (DSN address checks)");
  return Sentry.makeNodeTransport({ ...options, httpModule: publicOnlyHttp });
};

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
        makeMultiplexedTransport(publicOnlyTransport, () => (activeDsn ? [activeDsn] : []))(options),
        () => activeDsn !== null,
      ),
    // Request bodies stay out of events (sign-up bodies carry emails); query strings and headers keep the SDK's
    // default key filtering (token, password, cookie, … are redacted).
    dataCollection: { httpBodies: [] },
  });
}

// Reports an error while server reporting is on. `extra` must not carry secrets (tokens, passwords).
export function captureError(error: unknown, extra?: Record<string, unknown>): void {
  if (activeDsn) Sentry.captureException(error, { extra });
}

// Path only: query strings can carry tokens (e.g. /reset-password?token=…).
export function captureServerError(error: unknown, request: Request): void {
  captureError(error, { method: request.method, path: new URL(request.url).pathname });
}
