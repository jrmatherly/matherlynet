# AGENTS.md

This file provides guidance to AI coding agents when working with code in this repository.

<!-- AUTO-MANAGED: project-description -->
## Overview

matherlynet: an Astro SSR web app (`web/`) with better-auth (email/password plus optional GitHub/Google OAuth)
on Drizzle ORM and PostgreSQL, orchestrated by an Aspire TypeScript AppHost (`apphost.mts`). The same AppHost
runs the stack locally and publishes Docker Compose (with its own Postgres and the Aspire dashboard) or Kubernetes
(Helm: web only, on an existing Postgres) artifacts; CI builds the web image and pushes it, with a Helm chart pinned
to it, to `ghcr.io/jrmatherly/matherlynet`.

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
| E2E (stack running) | `cd web && pnpm e2e` (Playwright, Chromium; finds Mailpit and the app database via `aspire describe`, or takes `MAILPIT_URL` and `APPDB_URI`) |
| New auth schema / migration | `cd web && APPDB_URI=postgresql://unused pnpm db:generate` |
| Deployment artifacts | `aspire publish -o out/compose`; `DEPLOY_TARGET=k8s aspire publish -o out/k8s` |
| Compose web host port | `Web__HostPort=none` (default, cloudflared on the compose network) / `loopback` / `public` |
| Enable Umami | `Umami__Enabled=true aspire start` (`Umami__Public=true` at publish time adds a Compose host port) |
| Change Umami's admin password | `UMAMI_URL=<url> UMAMI_NEW_PASSWORD=<8+ chars> node scripts/umami-set-password.mjs` |
| Live playground with a fake model | `node web/tests/fake-llama.ts 18080`, `aspire secret set Parameters:playground-model-url http://127.0.0.1:18080`, then `aspire stop && aspire start`. To turn it off, `aspire secret delete Parameters:playground-model-url` and restart. A model-on E2E run reads and seeds `playground_call` through the stack's `APPDB_URI` and, when it ends, deletes every row created while it ran (any other live call on that stack included), so runs don't use up the 300-a-day site cap. A run killed midway leaves its rows: inside the site-daily test, 300 seeded seated rows that refuse every local live call until the next model-on run deletes them or you run `delete from playground_call where visitor = 'e2e-seed'` |
| Push images (CI does this) | `aspire do push` after `docker login ghcr.io` |

<!-- END AUTO-MANAGED -->

<!-- AUTO-MANAGED: architecture -->
## Architecture

```text
apphost.mts            Aspire AppHost: Postgres (pg/appdb; K8s takes `appdb-uri` instead), Umami (opt-in), Mailpit
                       (run mode only), web, parameters, GHCR
.aspire/modules/       generated AppHost TypeScript SDK (gitignored; `aspire restore`)
web/                   Astro SSR app (start.mjs entry, otel.mjs, migrate.mjs, server.mjs, src/lib, src/pages, tests,
                       e2e);
                       file-by-file map: .claude/rules/web-architecture.md (also loads when you work in web/)
.github/workflows/     publish-images.yml: on main (path-filtered) runs web-checks + e2e first, then builds, pushes and
                       attests the web image; a `chart` job pushes the Helm chart pinned to it, and a separate
                       no-permission job uploads Sentry source maps from the image
                       web-checks.yml: astro check, lint, test, build on PRs (web/** only) and when called
                       e2e.yml: Playwright on `aspire start` + `aspire publish` check, then `live.spec.ts` again on
                       a stack restarted with the fake model; PRs (web/** + AppHost), called
.github/pull_request_template.md  PR body: summary, verification evidence, deployment impact, docs
.github/renovate.json5 Renovate version updates: weekly, 7-day release age, exact pins, the version caps, and
                       pins outside package.json (Sentry CLI, Aspire packages and CLI); Dependabot security
                       updates, CodeQL default setup and private reporting are repo settings
SECURITY.md            policy: report privately via GitHub's "Report a vulnerability"; only `main` is supported
docs/deployment.md     production runbook: publish settings, .env, Cloudflare Tunnel + rules, Umami, Sentry, K8s,
                       live playground
deploy/                docker-compose.override.yaml: web healthcheck; `aspire publish` copies it next to the Compose file
out/                   aspire publish output (gitignored)
```

- Request flow: browser -> Astro middleware (session lookup) -> page render; auth calls hit `/api/auth/*`.
- Config flow: Aspire injects `APPDB_URI`, `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, OAuth ids/secrets, `ADMIN_EMAIL`,
  `MAIL_FROM`, `SMTP_URL`, `PORT`, and the optional `PLAYGROUND_MODEL_URL` and `PLAYGROUND_MODEL_KEY` (parameters
  `playground-model-url` and `playground-model-key`, the second a secret).

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
  enforces the match). Each palette, light and dark, must keep text at WCAG AA (4.5:1): accent and muted on bg,
  surface and accent-soft, muted on surface-2, and accent-ink on accent; `theme.test.ts` fails otherwise.
- CSP (`security.csp` in `astro.config.mjs`, sent as a header; `astro dev` skips it, so check a build): no inline
  `style` attributes, `on*=` handlers or unhashed inline scripts. Third-party origins are added per request with
  `Astro.csp` (see Telemetry.astro). Code blocks use Prism (token classes, colored from the palette in
  global.css), not Shiki, whose inline styles the CSP blocks. Post tables take no column alignment (`:---`
  renders `style="text-align:…"`; `content.test.ts` enforces it). A post that embeds a component is `.mdx`.
- Size images with classes (`w-28 h-auto aspect-square`), never a `style` attribute (string or object); give `<img>`
  its real `width`/`height` for layout shift and `h-auto` so they don't stretch it. SVG figures take color from
  `fill-*`/`stroke-*` token utilities, not `fill="#…"` or `style`.
- Shared Tailwind class strings live in `web/src/lib/form.ts` (`inlineLink` for prose links, `choice` for radio-chip
  labels, `badge` for small tag pills); reuse them rather than copying the classes.

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
  falls back to `SITE_DEFAULTS` for unknown values, and `parseSettingsForm()` rejects them. The /admin form reads the
  row with `readSiteSettings()`, which throws on a database error: `getSiteSettings()` falls back to defaults, and a
  form filled from those would save them over the real row.
- The display typeface is `data-type` on `<html>` (set in `Base.astro`); page and section titles use the `.display`
  class, which reads `--display-face` (small card and list headings stay Geist bold; Markdown post h2s in
  `.prose-content` read the same variables, h3 stays Geist). Newsreader goes through Astro's
  local font provider on the `@fontsource-variable/newsreader` files (the npm provider parses one CSS file per family,
  and none declares both normal and italic) and is preloaded only when serif is active.
  Cross-document view transitions are on (`@view-transition` in `global.css`); the header keeps its own
  `view-transition-name`.
- Visitor theme choices are cookies written by page script (`remember()` in `lib/theme-cookie.ts`): the header's
  `ModeToggle` sets color mode; the footer's `ThemeControls` sets Brand/Pro and Sans/Serif. The server reads them back
  into `Astro.locals.theme`.
- Share cards follow the site theme: pages call `ogImage(slug, siteSettings)` and `cardPalette()` picks Signal for a
  Brand site, else the Pro palette; the `?v=` palette key makes social caches refetch, and the route renders the
  palette it names (so a replica with older cached settings can't cache the wrong card under it). `Seo.astro` takes
  `themeColor` (a string for a forced mode, a light/dark pair when following the system; `themeColorFor()` decides)
  and emits `theme-color` meta tags.
- Nav visibility is the `nav` flag in `publicRoutes`; the same flag drives the footer's page links and the 404 page's
  links. The header's "Let's talk" button links to `person.sameAs[0]`; RSS and Account/Sign in live in the footer.
- Each page has one job, so facts aren't retold across pages: home is the overview (perspectives, case study),
  /changelog the timeline (recruiter facts, roles with highlights), /work the platforms (gateway generations),
  /about the person. Every inner page links to another from its body (`pages.test.ts`).
- The home perspective panels share one grid cell and switch with `visibility` (not `display`), so the block keeps the
  tallest panel's height and the page below doesn't jump; the radio `:has()` rules in `Perspectives.astro` only flip
  visibility. The hero grid is `1fr / 1.15fr` so the figure draws near full size.
- Owner-supplied wording stays `null` in `profile.ts` until the owner provides it, and the page renders it only when
  set; don't write placeholder copy. `availability` is the owner's own sentence, also on his LinkedIn summary.
- `person` in `lib/site.ts` feeds the Person JSON-LD in `Seo.astro` (`jobTitle`, `worksFor`, `knowsAbout`; only
  `knowsAbout` is not shown on a page, and `employer.name` in `profile.ts` reuses `worksFor`). `profile.ts` `intro` is
  a list of paragraphs where `*word*` marks emphasis (home page splits on `*`); `og.ts` reuses `headline` for the home
  card, swapping U+2011 (non-breaking hyphen, which keeps "15,000‑person" together) for "-": the card font lacks it.
  `sameAs` holds LinkedIn only (the footer and JSON-LD read it).
- The home gateway figure (`GatewayPath.astro`) animates with SMIL, not script or inline style, so the CSP holds. Pulse
  timings are computed in the frontmatter from lane lengths at one `SPEED`; `home.test.ts` pins the pulse counts and
  that every `keyTimes` list runs 0 to 1 in order (a bad list makes the browser drop the animation).
- Startup work that must be safe under multiple replicas (migrations) is serialized with a Postgres advisory lock.
- /playground is a browser simulation of the gateway, with a live path when `PLAYGROUND_MODEL_URL` is set. Live, the
  page POSTs the visitor's own request to `/api/playground`, and the server checks it, sends it to a self-hosted
  model and streams the answer back. The scenario chips and the no-script replay stay simulated in both modes.
  `lib/playground.ts` is pure and shared by the SSR replay, the page script, the server and the tests; every invented
  value lives in its `SIM` and is labelled demo or example on the page. The live path's real values live in its
  `LIVE`, except `PROMPT_MAX` beside it, and `BODY_MAX`, `BODY_MS`, `IN_FLIGHT_MAX` and the SQL's hour and day windows
  in `lib/playground-io.ts`. That file is server-only (the `playground_call` row, the model fetch, the stream). The
  page script must not import it. Prompt text must never be bound to a query or logged (a failed query's error
  quotes its parameters).
  `data/gateway.ts` is the one list of gates, callers and targets that the home figure and the playground share.
  The scenario chips switch panels with generated CSS (`scenarioCss()`, an inline `<style>` whose hash
  `GatewayConsole.astro` registers with `Astro.csp`). Without script each panel shows its scenario's `replay()`
  and the log shows `RECORDED_TOUR`.

<!-- END AUTO-MANAGED -->

<!-- AUTO-MANAGED: git-insights -->
## Git Insights

- Migrations run inside the web container on start: Aspire's Kubernetes publisher can't emit Jobs, and a separate
  run-once resource broke publishing.
- Astro sessions are disabled (`session: false` in `web/astro.config.mjs`, Astro 7.2+): the Node adapter's default
  filesystem session driver would diverge across replicas, and better-auth already keeps sessions in Postgres.
- The dev web endpoint is pinned to port 4321 so OAuth callback URLs stay stable.
- `astro check` and `astro sync` keep their Vite cache in `node_modules/.vite-sync` (check runs the config hook as
  `sync`) and `astro build` in `node_modules/.vite-build` (an inline integration in `web/astro.config.mjs`). On the
  default directory, which `astro dev` uses, a check run under a
  running stack replaced the dev server's optimized client deps: page scripts answered `504 Outdated Optimize Dep`
  and E2E form tests failed until `aspire resource web restart`.
- `web/src/db/index.ts` builds its `pg.Pool`s itself and keeps a `pool.on("error")` listener on each: without it, a
  Postgres restart or failover drops idle connections and the unhandled `error` event kills the web process. Each
  pool also puts an `error` listener on every client it connects: pg-pool removes its own from a client taken with
  `pool.connect()`, and a socket that drops then would be an uncaught exception. It also
  sets connect (5 s), statement (10 s) and query (15 s) timeouts: node-postgres has none, and a stopped Postgres behind
  a proxy that accepts TCP (Aspire's, locally) hung every request. The live playground queries on its own pool of 6
  connections (`playgroundDb`), one per call a process admits. A call that stops waiting for a query leaves the query
  holding its connection, so on the pool auth uses a flood of calls could take the connections sign-in needs.
- `security.allowedDomains` (`matherly.net`, https) in `web/astro.config.mjs` makes Astro trust `X-Forwarded-Proto`
  behind Cloudflare; without it form POSTs fail the origin check with 403. Don't use `Astro.clientAddress`: a client
  can spoof it through `X-Forwarded-Host`/`X-Forwarded-For`.
- The image runs `node start.mjs` as the `node` user (`publishAsNodeServer`; `publishAsPackageScript`'s
  `pnpm run start` fails as non-root: pnpm 12 tries to reinstall into the root-owned `node_modules`). `start.mjs`
  dynamically imports `otel.mjs`, `migrate.mjs`, then `server.mjs` in one process: static imports would load pg and
  Astro before OpenTelemetry's hook registers, and one process means SIGTERM reaches `server.mjs`. `server.mjs` sets
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
- `publish-images.yml`'s `chart` job pushes the Helm chart to
  `oci://ghcr.io/jrmatherly/matherlynet/charts/matherlynet` as `0.<run number>.<run attempt>` (`appVersion` =
  commit SHA), from `main` only (a manual run on another branch must not publish a higher version). A re-run gets
  a new version, and the job refuses to replace one that exists. The `push` job generates the chart and runs
  `scripts/check-chart.sh` (also run on PRs by `e2e.yml`) before the image push, so a chart that fails its checks
  publishes nothing; a failed chart push can't skip the source maps. CI writes the pushed image (`web@<digest>`)
  into `parameters.web.web_image` and renders the packaged chart to confirm it: `aspire publish` leaves the value
  as `web:latest`. The chart name comes from `withChartName` in `apphost.mts`; the chart is not attested.
- The image workflow runs only when the image, the chart or their checks can change (`web/**` minus docs, AppHost
  files, root `package*.json`, `scripts/check-chart.sh`, the workflow itself); `workflow_dispatch` bypasses the
  filter. `paths-ignore` can't take `!` exceptions, so it is an include list.
- Vitest sees an empty `writing` collection on a clean checkout (the content store exists only after a dev server
  or build has synced it), so which posts the feed and sitemap carry is asserted in `e2e/public.spec.ts`.
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
  the project uses it, and validate the change empirically before calling it done. When the installed version
  behaves differently from its docs, read its source under `node_modules` and name the package and version in the
  comment, so the workaround can be retired when the library changes.
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
- `playground_call` (`web/src/db/schema.ts`) holds one row per accepted live /playground call, written before any
  gate and closed with one decision (`forwarded`, `refused`, `cut`, `lost`). No row is written for Astro's 403,
  `parseCall()`'s 400, 408, 413 or 415, the per-process 503, or a failed insert. If the count after the insert fails,
  `open()` returns the row's id with no load, so the call is refused at Rate limits ("unavailable") and `run()`
  closes it like any other. The same rows are the rate limiter and the seat counter, so limits hold across replicas.
  A seat is claimed under a Postgres advisory lock, so at most three are seated at once. `liveIo.claim` takes a pool
  client and releases it itself rather than call `db.transaction()`: drizzle-orm 0.45.3 leaks the client when BEGIN
  fails. `routed_at` is never cleared: a row with it held a seat and counts toward the site's day. The table never
  stores prompt text, answer text or an IP, only a visitor key, the caller, lengths, token counts, timestamps and
  enum reasons. `visitorKey()` in `playground-io.ts` is the only playground code that reads `cf-connecting-ip`
  (`lib/auth.ts` gives better-auth the same header), and keys an IPv6 visitor on their /64. The route takes an 8 KB
  form body. Each process holds at most 6 calls (`IN_FLIGHT_MAX`), and more answer 503. The playground queries on
  its own pg pool (`playgroundDb` in `web/src/db/index.ts`), sized to that number. A model failure is reported to
  the log and Sentry as a code: a connection failure (DNS, TLS, refused), any status but 503 (a 400 is "model
  error"; a 2xx with no body too), an unreadable frame, or a 200 with no usable frame. A stream that drops
  mid-answer is reported as `playground: stream failed (<code>)`. A 503 and an abort are not reported.
- Dependencies: exact versions, latest stable. npm (`~/.npmrc`) and pnpm both enforce a minimum release
  age: pin a newer version explicitly (pnpm records `minimumReleaseAgeExclude`; npm needs
  `--min-release-age-exclude=<package-name>`). Known caps: `vscode-jsonrpc` 8.x (Aspire's generated
  transport imports `vscode-jsonrpc/node.js`), TypeScript 6.0.x (typescript-eslint and `@astrojs/check` peer ranges),
  `@types/node` 24.x (matches the Node 24 runtime). Keep the `allowedVersions` rules in `.github/renovate.json5` in
  sync with these caps. Renovate lists Aspire updates on its dashboard issue and opens that PR only when asked:
  Aspire still moves through `/bump-deps`.
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
- Observability: OpenTelemetry is infrastructure (Aspire injects OTEL_*; local and Compose dashboards). The
  Kubernetes chart has no dashboard and no OTLP endpoint (`withDashboard({ enabled: false })`), so telemetry is off
  there unless an install sets `OTEL_EXPORTER_OTLP_ENDPOINT`.
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
- Theme = palette × mode × typeface: visitor cookies `mn-theme`, `mn-mode`, `mn-type` over the /admin defaults (mode
  has none; it defaults to `system`). Page transitions are native cross-document view transitions (`@view-transition`
  in `global.css`); don't add `<ClientRouter />`. Page and section titles take `.display`; body text is always Geist.
- Markdown follows `.markdownlint-cli2.jsonc` (120 columns); the pre-commit hook enforces it.
- Don't push, publish images, or deploy without explicit approval.

<!-- END MANUAL -->
