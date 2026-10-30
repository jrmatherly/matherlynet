# Project audit, 2026-10-30

Read-only audit of `main` at df0a7c1 (tag v0.47.1). Eight parallel workers each took one area and wrote a full
report with the commands they ran; the lead re-measured the top claims on a production build served from
`node start.mjs` against the local Aspire stack. Worker reports live outside the repo in the session notes folder
(`audit-*.md`). Every claim below is labelled measured (a command or file read), inferred (follows from measured
facts) or guess (no evidence).

The short version. The code is careful and the hard parts hold: CSP as a header with hashes and no `unsafe-inline`,
origin checks, the SSRF guard on admin URLs, the breached-password hook, pool timeouts and listeners, the migration
lock, action pins, attestation and signed releases all check out. What needs attention is around the code: how the
chart rolls out, what CI never looks at (dependency vulnerabilities, the production CSP, the AppHost lint), what
Sentry collects, and docs that have started to disagree with each other.

## Ranked findings

Severity: critical (exploitable or data-losing now), high (likely to bite in production or on the next change),
medium (real but bounded), low (hygiene). Effort: S under an hour, M a half day, L a day or more.

| # | Sev | Finding | Evidence (what was run) | Recommended action | Effort |
| :-- | :-- | :-- | :-- | :-- | :-- |
| 1 | high | Every Kubernetes rollout can drop to zero ready pods: `replicas: 1`, `maxUnavailable: 1`, no preStop; production runs exactly that | `out/audit-k8s/templates/web/deployment.yaml` L66-71; read-only `kubectl get deploy matherlynet-web-deployment` (cluster patches only securityContext and resources) | Set `maxUnavailable: 0` (Flux postRenderer patch, or `withHelm` configure in `apphost.mts`); a failed migration then leaves the old pod serving | S |
| 2 | high | Web dependency vulnerabilities are invisible: GitHub's dependency graph has no pnpm packages, Dependabot shows 0 alerts, Renovate defers to Dependabot, CI never audits; `pnpm audit --prod` reports 10 (6 high) | `gh api .../dependency-graph/sbom` (171 packages, 0 astro, 0 better-auth); `pnpm audit --prod --json`; `pnpm-lock.yaml` is two YAML documents | Add `pnpm audit --prod --audit-level=high` to web-checks.yml; refresh the lockfile now (undici, source-map-js, systeminformation); enable Renovate `lockFileMaintenance` | S |
| 3 | high | Production CSP is never exercised by a test: all E2E runs on `astro dev`, which sends no CSP; a script the CSP blocks would break sign-in, theme toggles and the playground only in production | e2e.yml; Astro docs; grep for `content-security` in tests, e2e, scripts, workflows (0 assertions); built server sends the header (curl, measured) | A built-server E2E subset in e2e.yml (after smoke-image): assert the header and fail on any CSP console message | M |
| 4 | medium | Server Sentry events carry the visitor's IP and all request headers (`@sentry/node` 11.8.0 defaults `userInfo: true`, request headers on); the app sets only `httpBodies: []` | `node_modules/@sentry/core/.../resolveDataCollectionOptions.js` L3-6; `web/src/lib/sentry.ts:85`; worker's scratch script captured `user.ip_address` and `cf-connecting-ip` | `dataCollection: { httpBodies: [], userInfo: false, httpHeaders: { request: { deny: ["cf-connecting-ip", "x-forwarded-for", "x-real-ip"] } } }` | S |
| 5 | medium | Mail flood: better-auth limits per IP and path only (3/10 s sign-in and sign-up, 3/60 s reset and resend), nothing per recipient; one client can send about 18 verification mails a minute to one address through the owner's iCloud SMTP | better-auth 1.7.11 `api/rate-limiter/index.mjs`, `sign-in.mjs:336-350`; `auth.ts:55-87`; `docs/deployment.md` §5 rate rule covers `/api/playground` only | Cloudflare rate rule on `POST /api/auth/*` (low ceiling per IP); document it beside the playground rule | S |
| 6 | medium | The school, degree and years are still on `main` in two completed docs, and in PR #24's body; GitHub code search finds them | `git grep -i <school>`: `docs/superpowers/plans/completed/2026-10-02-home-and-changelog-redesign.md` (5 lines), `docs/superpowers/specs/completed/2026-10-02-home-and-changelog-design.md` (3 lines); `gh pr view 24` | Edit the eight lines out and PR #24's body. Leave history alone (9 commits, 177 descendants, 3 signed tags, 81 image tags; GitHub keeps PR refs). Deleting the 38 old GHCR images is optional | S |
| 7 | medium | No backup or restore procedure for either Postgres (Compose volume, home-cluster database): users, password hashes, OAuth tokens, sessions, site settings | `grep -rni 'backup\|pg_dump\|restore' docs README.md AGENTS.md` (nothing) | A "Backups" section in deployment.md: `pg_dump` for Compose, CNPG ScheduledBackup for the cluster; test one restore | M |
| 8 | medium | Pre-registration takeover on a fresh database: anyone can sign up `admin-email` with their own password; when the owner clicks the verification link the account verifies, auto-signs-in and is promoted | `auth.ts:55,76` (`requireEmailVerification`, `autoSignInAfterVerification: true`), promotion on verify; better-auth `sign-in.mjs:336-350` | Register the admin account first on every new database (write it into the deploy runbook); add "if you did not sign up, ignore this" to the verification mail | S |
| 9 | medium | Database traffic is unencrypted unless the URI says otherwise, and `sslmode=require` in pg 8.23.1 verifies the certificate (libpq would not), so it fails against CNPG's self-signed CA without a mounted root cert; whether the cluster connection is encrypted today is unknown | `pg-connection-string@2.14.1/index.js`; `docs/deployment.md` URI shape; Umami's `appdb_uri` may carry no query string | Decide for the cluster: `sslmode=no-verify`, or mount the CNPG CA and use `sslrootcert`; check with `pg_stat_ssl` first | S |
| 10 | medium | Doc copies disagree: playground, CI and release facts live in 3 or 4 files each; 13 version labels on workarounds are stale (13.6.0-preview, Vite 8.3.1, Astro 7.3.8, better-auth 1.7.7 x9, drizzle 0.45.3, nodemailer 10.0.13, OTel 0.222); one AGENTS.md claim is false (`Per<typeof AI_GATES, Check>` does not exist) | 236 claims checked by the docs worker: 186 hold, 13 stale, 1 false, 36 unverifiable from the repo | Relabel each as "checked on X"; cut AGENTS.md's gateway-figure and `playground_call` paragraphs to pointers; add a label sweep to /bump-deps | M |
| 11 | medium | Published Compose: `pg` has no `restart:` policy while web is `unless-stopped`; after a host reboot web crash-loops every 60 s against a Postgres that stays down; web also connects as the `postgres` superuser | `out/audit-compose/docker-compose.yaml` L12-28 | `restart: unless-stopped` on pg through `publishAsDockerComposeService`; a plain owner role is optional | S |
| 12 | medium | CI never runs the AppHost eslint and tsc, markdownlint or actionlint, though the PR template's /verify checklist implies it | `grep -nE 'eslint\|tsc\|markdownlint\|actionlint' .github/workflows/*.yml` (no matches) | One small job in web-checks.yml or a new `repo-checks.yml` | S |
| 13 | medium | Nothing checks that the schema and migrations agree, and migrations only ever run on a fresh database; a migration that fails on existing rows would crash-loop production | `drizzle-kit check` and `pnpm db:generate` clean today; grep for `drizzle` in workflows (nothing); smoke-image.sh migrates an empty Postgres | CI step: `db:generate` then `git diff --exit-code`; one upgrade test from the previous tag's migrations | S + M |
| 14 | medium | Aspire drift: local CLI 13.6.4, CI and `aspire.config.json` on 13.6.2; Renovate tracks the CLI pin but not the six packages, and may open a CLI-only PR that fails the checksum | `aspire --version`, `aspire.config.json`, `gh release list -R microsoft/aspire`, Renovate dashboard issue | Run /bump-deps to 13.6.4; check the Renovate log for the `aspire.config.json` lookup | S |
| 15 | low | The release gate depends on the live Have I Been Pwned API: E2E sign-up and reset go through `pwned.ts`, which fails closed | `pwned.ts:77`; `account.spec.ts` | Make the range URL overridable and stub it in E2E, or accept and document | S |
| 16 | low | Untested: session revocation on /account, the admin flow end to end, the pool error listeners and timeouts | grep across tests and e2e (no references); admin test uses a memory adapter | Add the three tests the tests report sketches (two S, one M) | S + M |
| 17 | low | Playground: the 300-a-day cap is checked at `open()` not at `claim()`, so concurrent calls can overshoot by a few; refused floods are kept 30 days and pruned inside the insert statement | `playground-io.ts` `open()` CTE and `claim()` UPDATE; `LIVE.retentionDays` | Add the day predicate to the claim UPDATE; rely on the documented Cloudflare rule for floods | S |
| 18 | low | Hidden source maps are still served: `/_astro/*.js.map` answers 200 (1 MB for the Sentry chunk) | `curl -o /dev/null -w %{http_code} .../_astro/prod.DHlTOdz4.js.map` on the build (200, 1007495 B) | Public repo, so disclosure is nil; drop them from `dist/client` in the Dockerfile stage or accept | S |
| 19 | low | Repository settings are looser than the workflows: SHA pinning not required, Actions can approve PRs, no ruleset on `v*` tags | `gh api .../actions/permissions`, `.../actions/permissions/workflow`, `.../rulesets` | Require SHA pinning, disable PR approval by Actions, add a `v*` tag ruleset | S |
| 20 | low | Version lag: Compose Postgres 18.3 (18.6 out), Compose dashboard from MCR's nightly repo (13.6.1 by digest; stable 13.6 is 13.6.2), Node 24 in maintenance since 2026-10-20 with Node 26 LTS since 2026-10-28 | compose output L3, L13; MCR and Docker Hub tag lists; `nodejs/Release` schedule | `.withImageTag('18.6')`; `withImage` on the stable dashboard; plan the Node 26 move | S, M for Node |
| 21 | low | Dead config: 17 `minimumReleaseAgeExclude` entries all past pnpm's one-day window; `allowScripts` does nothing in pnpm 12; Renovate never bumps the pre-commit hook pin | `npm view <pkg> time`; pnpm 12.16.1; Renovate pre-commit manager docs | Delete the entries and the field; enable Renovate's pre-commit manager | S |
| 22 | low | Rows that are never pruned: better-auth `rate_limit` (database storage has no sweep) and unverified sign-ups | better-auth 1.7.11 `api/rate-limiter/index.mjs`; grep in `web/src` | Accept at this traffic, or a periodic delete | S |
| 23 | low | `web/.dockerignore` does not exclude `.env*`; the image ships all of `/app` | `web/.dockerignore`; generated Dockerfile | Add `.env*` | S |
| 24 | low | The npm token once printed in a session: not in the tracked tree or in any of 197 commits (gitleaks hits are fixtures). Rotation is still a human step | `git log --all -p -G '(ghp_\|github_pat_\|npm_\|...)'`; gitleaks | Rotate it if it was ever live | S |

Two worker ratings were changed in this ranking. The playground worker rated the Sentry IP capture high; it is not
exploitable and the Sentry project is private, so it is medium here, placed first among the mediums because it
contradicts the privacy posture the playground documents. The docs worker's stale labels are folded into one row.

## What holds and should not be "fixed"

Measured on the production build unless noted.

- Security headers on pages: the CSP is a response header with sha256 hashes for every inline script and style, no
  `unsafe-inline`, `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`; plus
  `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
  `Permissions-Policy`, and HSTS when the site origin is https (`middleware.ts:16`, so localhost correctly gets none).
  Static `/_astro/*` files get none, which deployment.md §5 already hands to Cloudflare.
- A cross-site form POST gets Astro's 403. A POST with no Origin header reaches `/api/playground` (200, SSE), which
  browsers never send, so this only corrects a stale comment in `parseCall()`.
- `pwned.ts`: fails closed, 5 s timeout, the documented check order, the only before hook (tests pin all four).
- Admin URLs: the SSRF guard refuses private, loopback, link-local, shared and embedded-IPv4 IPv6 hosts;
  `/og/__proto__.png` is a 404 and share-card renders take about 4 ms warm.
- Playground live path: the model key reaches no span or log; prompt text is never bound to a query or logged; the
  auth pool is untouched except for the middleware session read; per-visitor counts are race-safe and seats are capped
  at 3 under the advisory lock; an abandoned stream frees its slot within 7 s; model output is inserted as text; the
  scenario `<style>` hash is in `style-src`; the four `playground_call` indexes cover the limiter's queries.
- Database: 10 + 6 connections per pod with 5 s connect, 10 s statement and 15 s query timeouts; the pg-pool listener
  claim is still true on pg-pool 3.14.0 (line 344 removes the idle listener at checkout); drizzle 0.45.4 runs all
  pending migrations in one transaction (so no `CREATE INDEX CONCURRENTLY` in a migration); the advisory lock is
  correct; no pod serves before its migrations finish; `start.mjs` exits 143 and 130 during the database wait;
  OTel pg spans carry statement text but no parameter values.
- Publish output: no deployment-state value or `localhost` leaks into Compose or the chart; no Postgres host port; no
  web host port by default; the dashboard binds 127.0.0.1:18888 behind a browser token; the chart satisfies the
  restricted pod security profile for web; `check-chart.sh` passes with and without Umami.
- CI: every action SHA matches its tag comment, actionlint 0 errors, per-job permissions are least privilege, the
  image attestation verifies (`gh attestation verify oci://ghcr.io/jrmatherly/matherlynet/web:df0a7c1... -R
  jrmatherly/matherlynet`), the three release tags are SSH-signed and sit on the commits that built their charts, and
  recent runs are green apart from cancellations and one Sentry 502.
- Tests: 24 files, 416 tests, 10.3 s, nothing skipped, and the suite passes with the network denied (`sandbox-exec`),
  so it is hermetic. The Vite HMR full-reload workaround and the session-ageing trick match the code.
- Exposure: no credentials, tokens, personal email, phone, address or LAN secret in the tree or history; `private/`,
  `.remember/` and `settings.local.json` are ignored and were never committed; `.mcp.json` holds no keys; images have
  no GPS or camera metadata; the live site and the linked résumé no longer name the school.

## Areas

### Web app, headers and auth

Worker report: `audit-web-security.md`. The posture is strong (see above). The two findings that matter are both
about what an unauthenticated visitor can make the server do by mail (#5, #8). W3 in the report, forged
`cf-connecting-ip` from a client that reaches the origin directly, is already documented and fails to a shared bucket;
it matters only if the Kubernetes ingress is reachable without Cloudflare, which this audit could not check (see Not
checked). W6, the admin-supplied Umami origin gets `script-src` on every page including `/admin` with no SRI, is an
accepted trade for self-hosted Umami. Comments in `auth.ts` name 1.7.7 for behaviour unchanged in 1.7.11, and one says
OAuth linking to an unverified account can verify it, which 1.7.11 refuses by default (doc drift, measured in
`oauth2/link-account.mjs`).

### Live playground

Worker report: `audit-playground.md`. 203 unit tests pass across the two playground files. One live POST was traced
end to end and the privacy claims in AGENTS.md hold for the table and the logs. The gap is Sentry (#4): `run()`
reports from inside the request's async context, so a model failure sends the visitor's IP and headers with the event.
The same applies, by inference, to every server event (middleware and auth errors), so the fix belongs in `sentry.ts`
and covers the whole app. The OTel server span also records `client.address` from `X-Forwarded-For` (low; decide
whether the Aspire dashboard may hold IPs). The visitor key is pseudonymous, not anonymous: anyone holding
`BETTER_AUTH_SECRET` can brute-force an IPv4 address from it (wording only).

### Database and process lifecycle

Worker report: `audit-db-lifecycle.md`. No doc drift in this slice; every timeout, lock and signal claim held when
re-read in the installed source or run (`start.mjs` was killed during the database wait and exited 143 and 130). The
findings are operational: rollout (#1), backups (#7), TLS (#9), the drift check (#13). Two non-obvious facts worth
keeping in mind: auth tables use `timestamp` without time zone (better-auth's generator) while `playground_call` uses
`timestamptz`, so auth timestamps are only right while every writer runs in UTC; and `/api/auth/ok` deliberately does
not touch the database, so a Postgres blip does not restart pods.

### AppHost and published output

Worker report: `audit-apphost-publish.md`, outputs in `out/audit-compose`, `out/audit-k8s`, `out/audit-compose-umami`,
`out/audit-k8s-umami` (gitignored). `npm run lint` and `tsc --noEmit` are clean; both publishes succeed with
`--non-interactive`. Beyond #1, #11 and #20: chart templates interpolate values unquoted, so a `"` in a secret value
breaks `helm template` (document it; the templates are Aspire's); with Umami on, its Deployment has no
securityContext or probes and deployment.md §7 does not mention it; `values.yaml` carries a dead
`secrets.umami.DATABASE_URL`; the "13.6.0-preview" comments at `apphost.mts:182` and `:194` describe workarounds that
are still needed on 13.6.2-preview.1 (measured: `fix-probe-scheme` still has work to do).

### CI and dependencies

Worker report: `audit-ci-deps.md`. The pipeline is sound (pins, permissions, attestation, chart version guard,
concurrency, Sentry job isolation). The findings are what CI does not look at (#2, #12, #13) and version drift (#14
and #20). On #2, the lead re-ran the checks: the SBOM GitHub serves has 171 packages and none of astro, better-auth or
undici; `pnpm audit --prod` lists source-map-js (high, build-time only), undici 8.x via astro's unifont (4 high, 4
moderate; fonts are on the local provider, so runtime exposure is low, inferred) and systeminformation (high,
Windows-only, via OTel host metrics). The lockfile begins with two YAML documents, which is the likely cause of the
graph gap (inferred from the SBOM contents, not confirmed with GitHub). The caps in renovate.json5 all still hold:
vscode-jsonrpc 9 dropped `node.js`, typescript-eslint and `@astrojs/check` cap TypeScript at 6.0.x, `@types/node` tracks
Node 24. `ubuntu-latest` is ubuntu-26.04 with Helm 4.3.1 and the chart push works on it; `workflows.md` still says
Helm 3.x. The repo had 39 unique cloners in the last 14 days (`gh api .../traffic/clones`).

### Tests and E2E

Worker report: `audit-tests.md`, with a route-by-route coverage map ranked by blast radius and five sketched tests.
The suite is hermetic and fast. The ranked gaps are #3 (production CSP), #13 (migration upgrade path), #15 (HIBP in
the release gate) and #16. Snapshot policy for the two gateway SVGs matches AGENTS.md. `smoke-image.sh` checks that
the migration count is greater than zero rather than equal to the journal length (6).

### Accessibility and performance

Measured by the lead on the production build (`pnpm build`, then `node start.mjs` on 127.0.0.1:4322 against the
stack's Postgres), Chrome DevTools MCP, Lighthouse in navigation mode, mobile device.

| Page | Accessibility | Best practices | SEO | Console errors |
| :-- | :-- | :-- | :-- | :-- |
| / | 100 | 100 | 100 | none |
| /about | 100 | 100 | 100 | none |
| /work | 100 | 100 | 100 | none |
| /changelog | 100 | 100 | 100 | none |
| /writing | 100 | 100 | 100 | none |
| /playground | 100 | 100 | 100 | none |

Home page performance trace, 390x844 at 3x, 4x CPU slowdown, Fast 4G, cache ignored, one run: LCP 534 ms (TTFB 11 ms,
render delay 523 ms), CLS 0.00. The limiter is the render-blocking stylesheet (`Base.*.css`, 41 KB) plus the one
preloaded Geist woff2 (29 KB); DevTools estimates 138 ms of LCP in the stylesheet. One run, so no spread; the number
is far inside the 2.5 s "good" threshold, which is why no further runs were made. Server times for the HTML, measured
with curl on loopback: 18 ms for the home page (84 KB), 12 ms for /playground (162 KB), under 7 ms for the rest.
Hashed assets send `Cache-Control: public, max-age=31536000, immutable`; favicons send `max-age=0`; the HTML sends no
`Cache-Control` and no `Content-Encoding` even when asked for br or gzip, so compression is Cloudflare's job (it
compresses proxied text by default; deployment.md §8 already records that the SSE stream is left alone). Nothing here
needs changing. If anything, the Node origin could gzip HTML for the direct Compose path, which is low value.

### Documentation

Worker report: `audit-docs.md`, with the 236-row claim table. markdownlint passes (25 files). Every command in the
AGENTS.md table that can run without a cluster ran. The /verify, /bump-deps and /ship skills, the PostToolUse hook,
`.mcp.json` and the Serena setup exist and match their descriptions. Beyond #10: CLAUDE.md says the hook lints each
edited file, but `.claude/hooks/lint-edited.sh` skips `web/e2e/**`, `web/scripts/**`, root `scripts/**` and
`deploy/**`; /verify may restart `web` on a reused stack after a failed E2E run, which CLAUDE.md does not say and which
matters when sessions share the stack; the "120-column limit" is soft (tables and code blocks are exempt, and
AGENTS.md line 33 is 738 characters); deployment.md §5 asks Cloudflare for three headers on static files while pages
also send Permissions-Policy and HSTS; and the completed plans show all 237 checkboxes unticked, with the folder as the
only "done" signal (nothing needed).

### Public-repo exposure

Worker report: `audit-exposure.md`, with a decision table for the school name. Recommendation: remove it from the two
tracked docs and PR #24's body (#6) and skip the history rewrite. A rewrite changes 177 of 197 commit SHAs, invalidates
three signed tags and releases, orphans 81 image tags and 19 chart `appVersion` values, and GitHub keeps old commits
reachable through PR refs and cached views; its policy says Support "won't remove non-sensitive data". Deleting the 38
GHCR web images built from commits that still carried the school is optional and costs rollback to those charts.

## Not checked

- Whether the home cluster's ingress is reachable without Cloudflare, and whether the Cloudflare rate rule from
  deployment.md §5 exists in the zone (needs the Cloudflare account).
- Whether the cluster's Postgres connection is encrypted today (`pg_stat_ssl` on the cluster settles it).
- An actual rollout gap: #1 is inferred from the controller's rollout math, not watched.
- `scripts/smoke-image.sh` was not run (Docker was down when that worker ran; OrbStack was started later for the
  stack). E2E was not run; the unit suite was.
- The two-replica migration race is reasoned from the code, not run against a database.
- Renovate's own run logs (needs a Mend login), and `gh attestation verify` with GitHub auth stripped.
- Whether LinkedIn shows education (needs a signed-in session). The linked résumé was rendered and names no school.
- Lighthouse performance category and desktop audits; one mobile trace was taken for the home page only.
- The contents of a pulled image (not pulled); image findings come from the generated Dockerfile.

## Method

Investigation playbook with a swarm partition: eight read-only workers (web security, playground, database and
lifecycle, AppHost and publish, CI and dependencies, tests, exposure, docs) on one shared brief, each writing a report
with verdict, ranked findings, how-it-works notes, doc drift and what it skipped. The lead re-measured the top claims
(Sentry defaults in the installed source, the no-Origin POST, HSTS gating, the chart strategy, the SBOM and audit
counts) and did the build, header, Lighthouse and trace measurements. Nothing in the repo was changed; `out/audit-*`
and `web/dist` are gitignored build output. The Aspire stack was started for the measurements and stopped afterwards.
