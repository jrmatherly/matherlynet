---
paths:
  - "web/src/lib/sentry.ts"
  - "web/src/components/Telemetry.astro"
  - "web/src/lib/auth.ts"
  - "web/src/lib/auth-client.ts"
  - "web/src/lib/pwned.ts"
  - "web/astro.config.mjs"
  - "web/otel.mjs"
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
