// Loaded first (start.mjs in production, `node --import ./otel.mjs` in dev) so OpenTelemetry patches modules before
// the app loads them. Aspire injects the OTEL_* settings (endpoint, protocol, headers, service name) under
// `aspire run` and in published Compose/K8s output; without an endpoint (tests, builds) this does nothing.
import { register } from "node:module";

if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
  // ESM imports are only instrumented through this loader hook.
  // ponytail: module.register is deprecated in newer @types/node; OpenTelemetry 0.222 ships only this hook.mjs.
  // Switch to module.registerHooks once @opentelemetry/instrumentation provides a hook for it.
  register("@opentelemetry/instrumentation/hook.mjs", import.meta.url);
  // fs/dns/net spans are noise next to the http, undici and pg spans.
  process.env.OTEL_NODE_DISABLED_INSTRUMENTATIONS ??= "fs,dns,net";
  // The default ("all") probes cloud metadata servers; `env` keeps Aspire's service.instance.id.
  process.env.OTEL_NODE_RESOURCE_DETECTORS ??= "env,host,os,process,container";
  // Same setup as auto-instrumentations-node/register (including its try/catch: telemetry is optional, so a
  // failed start still lets the app run), minus its SIGTERM/beforeExit listeners (the SIGTERM one never exits the
  // process); server.mjs calls __otelShutdown from its own shutdown so the last spans are exported first.
  const { NodeSDK } = await import("@opentelemetry/sdk-node");
  const { getNodeAutoInstrumentations, getResourceDetectors } = await import("@opentelemetry/auto-instrumentations-node");
  try {
    const sdk = new NodeSDK({
      instrumentations: getNodeAutoInstrumentations({
        // Server spans record url.path and url.query, and better-auth links carry secrets: ?token= (verify, reset),
        // OAuth ?code=&state=, and the emailed /api/auth/reset-password/<token>. Values become REDACTED.
        "@opentelemetry/instrumentation-http": {
          redactedQueryParamsServer: ["token", "code", "state"],
          startIncomingSpanHook: (req) =>
            req.url?.startsWith("/api/auth/reset-password/") ? { "url.path": "/api/auth/reset-password/REDACTED" } : {},
        },
      }),
      resourceDetectors: getResourceDetectors(),
    });
    sdk.start();
    globalThis.__otelShutdown = () => sdk.shutdown();
  } catch (error) {
    // console, not diag: OpenTelemetry's diag logger is silent unless OTEL_LOG_LEVEL is set.
    console.error("OpenTelemetry failed to start; continuing without telemetry", error);
  }
}
