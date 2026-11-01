# AGENTS.md

This file provides guidance to AI coding agents when working with code in this repository. Area detail lives in
`.claude/rules/`: Claude Code loads each file when it touches matching paths; other tools should read the one for
the area they change (`apphost.md`, `database.md`, `integrations.md`, `runtime.md`, `web-architecture.md`,
`web-patterns.md`, `workflows.md`).

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
| Live playground with a fake model | `node web/tests/fake-llama.ts 18080`, `aspire secret set Parameters:playground-model-url http://127.0.0.1:18080`, then `aspire stop && aspire start`. To turn it off, `aspire secret delete Parameters:playground-model-url` and restart. E2E's effect on `playground_call`: `.claude/rules/web-patterns.md` |
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
                       web-checks.yml: audit, astro check, schema drift, lint, test, build, server smoke on PRs
                       (web/** only) and when called
                       repo-checks.yml: AppHost lint/tsc, Markdown and workflow lint on PRs (AppHost, Markdown and
                       workflow paths)
                       e2e.yml: Playwright on `aspire start` + `aspire publish` check, the image smoke
                       (scripts/smoke-image.sh), then `live.spec.ts` again on a stack restarted with the fake model;
                       PRs (web/** + AppHost), called
.github/pull_request_template.md  PR body: summary, verification evidence, deployment impact, docs
.github/renovate.json5 Renovate version updates: weekly, 7-day release age, exact pins, the version caps, and
                       pins outside package.json (Sentry CLI, Aspire packages and CLI, the Postgres and Compose
                       dashboard images, the markdownlint-cli2 hook, workflow and config `$schema`); Dependabot
                       security updates, CodeQL default setup and private reporting are repo settings
SECURITY.md            policy: report privately via GitHub's "Report a vulnerability"; only `main` is supported
docs/deployment.md     production runbook: publish settings, .env, Cloudflare Tunnel + rules, Umami, Sentry, K8s,
                       live playground
docs/superpowers/      design specs and implementation plans; finished ones move to `completed/`
scripts/               check-chart.sh and smoke-image.sh (CI, also run locally), umami-set-password.mjs
deploy/                docker-compose.override.yaml: web healthcheck; `aspire publish` copies it next to the Compose file
out/                   aspire publish output (gitignored)
```

- Request flow: browser -> Astro middleware (session lookup) -> page render; auth calls hit `/api/auth/*`.
- Config flow: Aspire injects `APPDB_URI`, `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, OAuth ids/secrets, `ADMIN_EMAIL`,
  `MAIL_FROM`, `SMTP_URL`, `PORT`, and the optional `PLAYGROUND_MODEL_URL`, `PLAYGROUND_MODEL_KEY` and
  `PLAYGROUND_MODEL` (parameters `playground-model-url`, `playground-model-key` and `playground-model`, the key a
  secret; an empty model
  means `LIVE.model`, read through `liveModel()` in `lib/playground-io.ts`).

<!-- END AUTO-MANAGED -->

<!-- AUTO-MANAGED: conventions -->
## Code Conventions

- ES modules everywhere; 2-space indentation; semicolons.
- Quotes: single quotes in `apphost.mts`; double quotes in `web/` TypeScript and scripts.
- Read runtime config from `process.env` in server code (never `import.meta.env` for values injected at run time).
- Dependencies are pinned to exact versions (no `^`/`~`) in both `package.json` files.
- Markdown: 120-column limit, every file starts with a top-level heading (`.markdownlint-cli2.jsonc`, enforced by
  the pre-commit hook and CI).

<!-- END AUTO-MANAGED -->

<!-- AUTO-MANAGED: patterns -->
## Detected Patterns

- AppHost resources are configured with fluent chains; secrets and environment-specific values are Aspire
  parameters (`addParameter`, `addParameterWithGeneratedValue`), never literals.
- Optional features are gated on configuration: an OAuth provider is registered only when both its client id
  and secret are non-empty.
- Generated artifacts (AppHost SDK, auth schema, migrations, deploy output) are regenerated by their tools,
  not edited by hand.
- Startup work that must be safe under multiple replicas (migrations) is serialized with a Postgres advisory lock.

<!-- END AUTO-MANAGED -->

<!-- AUTO-MANAGED: git-insights -->
## Git Insights

- Decisions and what they rest on sit with their area in `.claude/rules/`, not here.

<!-- END AUTO-MANAGED -->

<!-- AUTO-MANAGED: best-practices -->
## Best Practices

- Verify before declaring work done: lint, type-check, build, and smoke-test the running stack.
- Prefer the project's tools over ad-hoc edits for generated files (`aspire add`, `pnpm db:generate`).
- Keep this file under 200 lines: what every session needs. A new area fact goes in that area's `.claude/rules/` file.

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
- Dependencies: exact versions, latest stable. pnpm refuses versions under a day old (its default
  `minimumReleaseAge`): pinning one makes pnpm record a `minimumReleaseAgeExclude` entry. npm has no release-age guard
  unless `~/.npmrc` sets `min-release-age` (then pass `--min-release-age-exclude=<package-name>`); Renovate waits 7
  days. Known caps: `vscode-jsonrpc` 8.x (Aspire's generated
  transport imports `vscode-jsonrpc/node.js`), TypeScript 6.0.x (typescript-eslint and `@astrojs/check` peer ranges),
  `@types/node` 24.x (matches the Node 24 runtime). Keep the `allowedVersions` rules in `.github/renovate.json5` in
  sync with these caps. Renovate lists Aspire updates on its dashboard issue and opens that PR only when asked:
  Aspire still moves through `/bump-deps`. CI fails on a high production advisory (`pnpm audit --prod
  --audit-level=high` in web-checks); fix it with `pnpm update <package>` or an `overrides` entry in
  `web/pnpm-workspace.yaml` (pnpm 12 ignores `pnpm.overrides` in package.json).
- Security fixes skip the 7-day holds, which are for version updates (Renovate, `~/.npmrc`). A known advisory (a
  Dependabot alert or `pnpm audit`) is the trigger: the fix waits one day after the fixed version's release, then lands
  once CI is green. When no parent accepts the fixed version yet, pin it in `overrides` and delete the pin once the
  parents move: `web/pnpm-workspace.yaml`'s comments give each entry's reason, and the root `package.json`'s `minimatch`
  is GHSA-g3hv-75wg-m249.
- Keep `pmOnFail: ignore` in `web/pnpm-workspace.yaml` (its comment says why). Without it, any pnpm command rewrites the
  lockfile to two documents, even `pnpm --version`, and `--frozen-lockfile` accepts that. `tests/lockfile.test.ts` is
  the check that fails.
- pnpm 12 blocks dependency build scripts: approve with `pnpm approve-builds <pkg>`.
- The generated Dockerfile installs on glibc (node:24-slim) and runs on Alpine (musl). `web/pnpm-workspace.yaml`
  sets `supportedArchitectures.libc: [current, musl]` so native packages (`@takumi-rs/core`) ship musl builds;
  keep it when adding native dependencies.
- Secrets come from Aspire parameters (`aspire secret set Parameters:<name> <value>`), never from
  committed files. OAuth providers stay disabled until both their id and secret are set.
- Don't push, publish images, or deploy without explicit approval.

<!-- END MANUAL -->
