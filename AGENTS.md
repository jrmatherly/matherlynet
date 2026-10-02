# AGENTS.md

This file provides guidance to AI coding agents when working with code in this repository.

<!-- AUTO-MANAGED: project-description -->
## Overview

matherlynet: an Astro SSR web app (`web/`) with better-auth (email/password plus optional GitHub/Google OAuth)
on Drizzle ORM and PostgreSQL, orchestrated by an Aspire TypeScript AppHost (`apphost.mts`). The same AppHost
runs the stack locally and publishes Docker Compose or Kubernetes (Helm) artifacts; CI builds the web image and
pushes it to `ghcr.io/jrmatherly/matherlynet`.

<!-- END AUTO-MANAGED -->

<!-- AUTO-MANAGED: build-commands -->
## Build & Development Commands

| Task | Command |
| :--- | :--- |
| Start the stack (Postgres + web) | `aspire start` (background) or `aspire run`; app at <http://localhost:4321> |
| Inspect / logs / stop | `aspire describe`, `aspire logs web`, `aspire wait web`, `aspire stop` |
| Lint and type-check the AppHost | `npm run lint` and `npx tsc -p tsconfig.apphost.json --noEmit` |
| Lint Markdown | `markdownlint-cli2` (or `pre-commit run --all-files`) |
| Check / lint / test / build the web app | `cd web && pnpm check` (astro check), `pnpm lint`, `pnpm test`, `pnpm build` |
| Smoke test (stack running) | `curl -s http://localhost:4321/api/auth/ok` returns `{"ok":true}` |
| E2E (stack running) | `cd web && pnpm e2e` (Playwright, Chromium; finds Mailpit via `aspire describe`) |
| New auth schema / migration | `cd web && APPDB_URI=postgresql://unused pnpm db:generate` |
| Deployment artifacts | `aspire publish -o out/compose`; `DEPLOY_TARGET=k8s aspire publish -o out/k8s` |
| Compose web host port | `Web__HostPort=none` (default, cloudflared on the compose network) / `loopback` / `public` |
| Enable Umami | `Umami__Enabled=true aspire start` (`Umami__Public=true` at publish time adds a Compose host port) |
| Change Umami's admin password | `UMAMI_URL=<url> UMAMI_NEW_PASSWORD=<8+ chars> node scripts/umami-set-password.mjs` |
| Push images (CI does this) | `aspire do push` after `docker login ghcr.io` |

<!-- END AUTO-MANAGED -->

<!-- AUTO-MANAGED: architecture -->
## Architecture

```text
apphost.mts            Aspire AppHost: Postgres (pg/appdb), Umami (opt-in), Mailpit (run mode only), web, parameters, GHCR
.aspire/modules/       generated AppHost TypeScript SDK (gitignored; `aspire restore`)
web/                   Astro SSR app (server.mjs entry, otel.mjs, migrate.mjs, src/lib, src/pages, tests, e2e);
                       file-by-file map: .claude/rules/web-architecture.md (also loads when you work in web/)
.github/workflows/     publish-images.yml: on main (path-filtered) runs web-checks + e2e first, then builds, pushes and
                       attests the web image; a separate no-permission job uploads Sentry source maps from it
                       web-checks.yml: astro check, lint, test, build on PRs (web/** only) and when called
                       e2e.yml: Playwright on `aspire start` + `aspire publish` check; PRs (web/** + AppHost), called
.github/pull_request_template.md  PR body: summary, verification evidence, deployment impact, docs
.github/dependabot.yml weekly npm (/, /web) + actions updates, 7-day cooldown, exact pins
                       (security updates, CodeQL default setup and private reporting are repo settings)
SECURITY.md            policy: report privately via GitHub's "Report a vulnerability"; only `main` is supported
docs/deployment.md     production runbook: publish settings, .env, Cloudflare Tunnel + rules, Umami, Sentry, K8s
deploy/                docker-compose.override.yaml: web healthcheck; `aspire publish` copies it next to the Compose file
out/                   aspire publish output (gitignored)
```

- Request flow: browser -> Astro middleware (session lookup) -> page render; auth calls hit `/api/auth/*`.
- Config flow: Aspire injects `APPDB_URI`, `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, OAuth ids/secrets, `ADMIN_EMAIL`,
  `MAIL_FROM`, `SMTP_URL`, `PORT`.

<!-- END AUTO-MANAGED -->

<!-- AUTO-MANAGED: conventions -->
## Code Conventions

- ES modules everywhere; 2-space indentation; semicolons.
- Quotes: single quotes in `apphost.mts`; double quotes in `web/` TypeScript and scripts.
- Read runtime config from `process.env` in server code (never `import.meta.env` for values injected at run time).
- Dependencies are pinned to exact versions (no `^`/`~`) in both `package.json` files.
- Markdown: 120-column limit; every file starts with a top-level heading.
- Styling: Tailwind utilities on design tokens only (`bg-surface`, `text-muted`, `bg-accent`…); the default
  Tailwind palette is disabled. New palettes need a block in `palettes.css` and a key in `palettes.ts` (a test
  enforces the match).
- CSP (`security.csp` in `astro.config.mjs`, sent as a header; `astro dev` skips it, so check a build): no inline
  `style` attributes, `on*=` handlers or unhashed inline scripts. Third-party origins are added per request with
  `Astro.csp` (see Telemetry.astro). Code blocks use Prism (token classes, colored from the palette in
  global.css), not Shiki, whose inline styles the CSP blocks.

<!-- END AUTO-MANAGED -->

<!-- AUTO-MANAGED: patterns -->
## Detected Patterns

- AppHost resources are configured with fluent chains; secrets and environment-specific values are Aspire
  parameters (`addParameter`, `addParameterWithGeneratedValue`), never literals.
- Optional features are gated on configuration: an OAuth provider is registered only when both its client id
  and secret are non-empty.
- Generated artifacts (AppHost SDK, auth schema, migrations, deploy output) are regenerated by their tools,
  not edited by hand.
- Account forms handled by page script still declare `method="post"`, so a submit that beats the script can't put
  the password in a query string.
- Public pages come from `publicRoutes` in `src/lib/site.ts`; the public origin is `BETTER_AUTH_URL`.
- Site settings (`site_settings` row, edited on /admin) carry the default theme, Pro palette and display typeface
  (`sans`/`serif`). New columns need a DB default so the existing row migrates; `fromRow()` in `site-settings.ts`
  falls back to `SITE_DEFAULTS` for unknown values, and `parseSettingsForm()` rejects them.
- Startup work that must be safe under multiple replicas (migrations) is serialized with a Postgres advisory lock.

<!-- END AUTO-MANAGED -->

<!-- AUTO-MANAGED: git-insights -->
## Git Insights

- Migrations run inside the web container on start: Aspire's Kubernetes publisher can't emit Jobs, and a separate
  run-once resource broke publishing.
- Astro sessions are disabled (`session: false` in `web/astro.config.mjs`, Astro 7.2+): the Node adapter's default
  filesystem session driver would diverge across replicas, and better-auth already keeps sessions in Postgres.
- The dev web endpoint is pinned to port 4321 so OAuth callback URLs stay stable.
- `web/src/db/index.ts` builds the `pg.Pool` itself and keeps its `pool.on("error")` listener: without it, a Postgres
  restart or failover drops idle connections and the unhandled `error` event kills the web process. It also sets
  connect (5 s), statement (10 s) and query (15 s) timeouts: node-postgres has none, and a stopped Postgres behind a
  proxy that accepts TCP (Aspire's, locally) hung every request.
- `security.allowedDomains` (`matherly.net`, https) in `web/astro.config.mjs` makes Astro trust `X-Forwarded-Proto`
  behind Cloudflare; without it form POSTs fail the origin check with 403. Don't use `Astro.clientAddress`: a client
  can spoof it through `X-Forwarded-Host`/`X-Forwarded-For`.
- `start` is `node migrate.mjs && exec node --import ./otel.mjs ./server.mjs`. `server.mjs` sets
  `ASTRO_NODE_AUTOSTART=disabled`, calls `startServer()`, and on SIGTERM/SIGINT drains 7 s, flushes Sentry 1 s and
  OpenTelemetry 1.5 s, then exits 0, inside Docker's 10 s stop timeout. `otel.mjs` builds `NodeSDK` itself because
  `register.js`'s SIGTERM listener never exits.
- Server Sentry is initialised once (`web/src/lib/sentry.ts`); a /admin DSN change only retargets
  `makeMultiplexedTransport` (`@sentry/core`). A second `Sentry.init` inside a request binds to that request's scope
  only and stacks process handlers, so later requests kept the old client.
- The Sentry DSN is admin-supplied and the server posts to it, so `web/src/lib/settings-form.ts` rejects private,
  loopback, link-local and shared (100.64/10) hosts, including IPv6 forms that embed IPv4. `isPrivateAddress()` is
  reused at connect time by server Sentry's DNS lookup (`sentry.ts`), so a name that resolves locally is refused;
  a zone id is stripped first and unparseable IPv6 fails closed. Server Sentry ignores http(s)_proxy (it warns).
- `web/src/lib/pwned.ts` answers what the route would refuse anyway before its breach lookup, in the endpoints' order:
  no session 401, missing admin permission 403, then the length rules (12-128). It refuses rather than skips when its
  session read disagrees with the endpoint's, so nothing gets through unchecked; its read passes `disableRefresh`
  (this hook's Set-Cookie is dropped) and lets a database error surface as a 500. It must stay the only before hook on
  password routes: before hooks see the original body (a test in `auth-config.test.ts` enforces this).
- CI pins actions to commit SHAs, cancels superseded runs, and tags images with the commit SHA.
  Images carry a build provenance attestation: `gh attestation verify oci://ghcr.io/jrmatherly/matherlynet/web:<sha>
  -R jrmatherly/matherlynet`.
- The image workflow runs only when the image can change (`web/**` minus docs, AppHost files, root `package*.json`,
  the workflow itself); `workflow_dispatch` bypasses the filter. `paths-ignore` can't take `!` exceptions, so it is
  an include list.
- Markdown is linted by markdownlint-cli2 via a pre-commit hook (staged files only).
- `.gitignore` excludes local tooling state: `.codegraph/`, `.remember/`, `.serena/cache/`, `private/`,
  `.claude/settings.local.json`, `CLAUDE.local.md` and `.claude/auto-memory/dirty-files*`.

<!-- END AUTO-MANAGED -->

<!-- AUTO-MANAGED: best-practices -->
## Best Practices

- Verify before declaring work done: lint, type-check, build, and smoke-test the running stack.
- Prefer the project's tools over ad-hoc edits for generated files (`aspire add`, `pnpm db:generate`).
- Keep this file concise; area-specific detail belongs in the Rules below or tool-specific config.

<!-- END AUTO-MANAGED -->

<!-- MANUAL -->
## Rules

- NEVER guess. NEVER assume. ALWAYS research. ALWAYS validate. ALWAYS confirm. ASK questions when something is
  unclear or ambiguous. For a third-party library or service, read its official documentation before changing how
  the project uses it, and validate the change empirically before calling it done.
- Run the app only through Aspire. Never run `astro dev` or `pnpm dev` directly: they start without
  the database, secrets, or the fixed port 4321 that auth callbacks depend on.
- After editing `web/astro.config.mjs` or web dependencies, run `aspire resource web restart`: the in-process
  dev restart leaves Vite's optimized deps stale (pages answer `504 Outdated Optimize Dep`, scripts never run).
- `apphost.mts` is the source of truth for infrastructure. Dockerfiles, Compose files and Helm charts
  are generated into `out/` (gitignored); never hand-edit or commit them.
- Never edit `.aspire/` (generated TypeScript SDK). Regenerate with `aspire restore`; add integrations
  with `aspire add <name>`. Its `aspire.mts` is the authority for AppHost API signatures; aspire.dev
  snippets can lag (13.6: `withHelm({ configure })`, `withEndpointCallback` instead of
  `withHttpEndpoint` on `addViteApp`).
- Database: never edit migrations in `web/drizzle/` by hand. Change the better-auth config or
  `web/src/db/`, then run `pnpm db:generate` and commit the new SQL. `web/migrate.mjs` applies
  migrations on every start under a Postgres advisory lock.
- Dependencies: exact versions, latest stable. npm (`~/.npmrc`) and pnpm both enforce a minimum release
  age: pin a newer version explicitly (pnpm records `minimumReleaseAgeExclude`; npm needs
  `--min-release-age-exclude=<package-name>`). Known caps: `vscode-jsonrpc` 8.x (Aspire's generated
  transport imports `vscode-jsonrpc/node.js`), TypeScript 6.0.x (typescript-eslint and `@astrojs/check` peer ranges),
  `@types/node` 24.x (matches the Node 24 runtime). Keep `.github/dependabot.yml` ignores in sync with these caps.
- pnpm 12 blocks dependency build scripts: approve with `pnpm approve-builds <pkg>`.
- The generated Dockerfile installs on glibc (node:24-slim) and runs on Alpine (musl). `web/pnpm-workspace.yaml`
  sets `supportedArchitectures.libc: [current, musl]` so native packages (`@takumi-rs/core`) ship musl builds;
  keep it when adding native dependencies.
- Secrets come from Aspire parameters (`aspire secret set Parameters:<name> <value>`), never from
  committed files. OAuth providers stay disabled until both their id and secret are set.
- Optional AppHost parameters go through `optionalParameter()`: `addParameter`'s `value` overrides user
  secrets and `Parameters__*` env vars, so a plain `{ value: '' }` default can never be set.
- Admins: the verified account whose email matches the `admin-email` parameter is promoted on verify.
  Keep `requireEmailVerification` on; without it anyone could register that email. Promotion happens only when
  the email becomes verified (not on every update, so demotions stick): set `admin-email` before that account's
  email is verified. Promotion failures are logged with the SQL to finish them; `/api/auth/*` errors go to Sentry
  through better-auth's `onAPIError` and an after-hook, not the Astro middleware.
- Observability: OpenTelemetry is infrastructure (Aspire injects OTEL_*; local and published dashboards).
  Sentry DSN/switches and Umami script/website id are runtime settings on /admin, not Aspire parameters.
  Sentry is errors-only (`enableOpenTelemetrySetup` stays false); never add a second tracer provider.
- Sentry stack traces: the build emits hidden source maps with debug IDs (`@sentry/bundler-plugins/vite`,
  upload disabled: the Aspire-generated Dockerfile takes no build secrets). CI uploads from the image's `/app/dist`
  with `--no-rewrite`. The release is `SENTRY_RELEASE` = `IMAGE_TAG`, so set `IMAGE_TAG` when publishing.
- Umami uses appdb's `umami` schema (`?schema=umami`), not its own database: published output only creates
  `POSTGRES_DB`. Don't use the toolkit's `withPostgreSQL()`; it inlines the Postgres password when published.
- Umami is opt-in (`Umami:Enabled`; config keys are read with `getConfiguration()`, since parameters resolve too
  late to gate a resource). Off, it isn't in local runs or published output. Its default `admin/umami` login can
  only be changed through its API: `scripts/umami-set-password.mjs`.
- Compose-only settings (`publishAsDockerComposeService`) are guarded by `!k8s`: under `DEPLOY_TARGET=k8s` there is
  no Compose environment and the publish fails validation.
- GitHub Actions: pin actions to full commit SHAs with a `# vX.Y.Z` comment, keep the concurrency
  group, emoji step names, and run `actionlint`.
- Markdown follows `.markdownlint-cli2.jsonc` (120 columns); the pre-commit hook enforces it.
- Don't push, publish images, or deploy without explicit approval.

<!-- END MANUAL -->
