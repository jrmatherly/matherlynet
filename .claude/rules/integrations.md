---
paths:
  - "web/src/lib/sentry.ts"
  - "web/src/components/Telemetry.astro"
  - "web/src/lib/auth.ts"
  - "web/src/lib/auth-client.ts"
  - "web/src/lib/pwned.ts"
  - "web/src/lib/scrub-url.ts"
  - "web/src/lib/settings-form.ts"
  - "web/src/lib/site-settings.ts"
  - "web/src/middleware.ts"
  - "web/astro.config.mjs"
  - "web/otel.mjs"
  - "web/start.mjs"
  - "web/server.mjs"
  - "apphost.mts"
---

# Third-party integrations: read the source before changing them

These files configure vendor SDKs whose behavior isn't obvious from their options. Before changing how one is used,
read the vendor's documentation, then confirm against the installed source in `node_modules` (docs lag; several
settings here are confirmed only in source). Cite what you relied on in the commit body.

| Vendor | Where to look |
| :--- | :--- |
| Sentry (`@sentry/node`, `@sentry/browser`, `@sentry/core`) | docs.sentry.io, the Sentry MCP, sentry-javascript repo docs and discussions, `node_modules/@sentry/*/build/esm` |
| better-auth | better-auth MCP (`search_docs` / `get_doc`, version from the lockfile), `node_modules/better-auth/dist` |
| Astro and `@astrojs/node` | astro-docs MCP, `node_modules/astro/dist/core/app`, `node_modules/@astrojs/node/dist` |
| Aspire | aspire MCP and aspire.dev; `.aspire/modules/aspire.mts` for exact signatures (grep it, never read it whole) |
| OpenTelemetry | opentelemetry.io, `node_modules/@opentelemetry/*/build` |

Then validate the change empirically (a built app, a local envelope sink, `aspire publish` output) before calling
it done.

## Sentry, the breach check and telemetry

- Server Sentry is initialised once (`web/src/lib/sentry.ts`); a /admin DSN change only retargets
  `makeMultiplexedTransport` (`@sentry/core`). A second `Sentry.init` inside a request binds to that request's scope
  only and stacks process handlers, so later requests kept the old client. It collects no request bodies, query strings
  or Referer and redacts the reset token in the URL path (the SDK filters only query and header values by key);
  `sentry-wiring.test.ts` sends a real request through the SDK to a local sink to check it.
- The Sentry DSN is admin-supplied and the server posts to it, so `web/src/lib/settings-form.ts` rejects private,
  loopback, link-local and shared (100.64/10) hosts, including IPv6 forms that embed IPv4. `isPrivateAddress()` is
  reused at connect time by server Sentry's DNS lookup (`sentry.ts`), so a name that resolves locally is refused;
  a zone id is stripped first and unparseable IPv6 fails closed. Server Sentry ignores http(s)_proxy (it warns).
- `web/src/lib/pwned.ts` answers what the route would refuse anyway before its breach lookup, in the endpoints' order:
  no session 401, missing admin permission 403, then the length rules (12-128). It refuses rather than skips when its
  session read disagrees with the endpoint's, so nothing gets through unchecked; its read passes `disableRefresh`
  (this hook's Set-Cookie is dropped) and lets a database error surface as a 500. It must stay the only before hook on
  password routes: before hooks see the original body (a test in `auth-config.test.ts` enforces this).
- Observability: OpenTelemetry is infrastructure (Aspire injects OTEL_*; local and Compose dashboards). The
  Kubernetes chart has no dashboard and no OTLP endpoint (`withDashboard({ enabled: false })`), so telemetry is off
  there unless an install sets `OTEL_EXPORTER_OTLP_ENDPOINT`.
  Sentry DSN/switches and Umami script/website id are runtime settings on /admin, not Aspire parameters.
  Sentry is errors-only (`enableOpenTelemetrySetup` left unset, the SDK's default false); never add a second tracer
  provider.
- Sentry stack traces: the build emits hidden source maps with debug IDs (`@sentry/bundler-plugins/vite`,
  upload disabled: the Aspire-generated Dockerfile takes no build secrets). CI uploads from the image's `/app/dist`
  with `--no-rewrite`. The release is `SENTRY_RELEASE` = `IMAGE_TAG`, so set `IMAGE_TAG` when publishing.
