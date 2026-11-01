# Audit Fixes, Housekeeping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining medium and low findings of the 2026-10-30 audit: a Compose backup procedure, stale
version labels in docs and comments, three untested flows, a playground cap that can overshoot, dead package
configuration, missing `.env*` in the Docker context, repository settings, version lag, and the items that are
decisions rather than code.

**Architecture:** Small independent PRs. Each task names the file, the exact change and the check that proves it.
Tasks marked "decide" end in a runbook sentence or a settings change, not code. Nothing here changes the chart's
objects, so these can land between releases without a deploy.

**Tech Stack:** as the platform plan.

**Spec:** `docs/superpowers/specs/completed/2026-10-30-project-audit.md`, findings 7, 10, 15, 16, 17, 18, 19, 20, 21,
22, 23 and 24. Finding 6 is in `2026-10-30-site-copy-corrections.md`.

## Global Constraints

Those of `2026-10-30-audit-fixes-platform-security-ci.md` apply unchanged.

## Review Focus

- Relabelling a workaround comment with the installed version is only right when the workaround was re-checked on
  that version; Task 2 re-checks each one and drops the label where the behaviour is gone.
- A test for the pool error listeners must not open a real connection in Vitest; Task 3 asserts listener counts on
  the pool objects, as `playground-io.test.ts:547` already does.
- Adding the day predicate to `claim()` changes a refused call's row shape; Task 4's test pins that an over-cap claim
  returns `false` and leaves `routed_at` null.
- 18.3 to 18.6 is a Postgres minor release: same data directory format, no dump and restore, just a new image. The
  Node 26 move is a separate plan, not a bullet.
- Ordering against the platform plan: Task 7 lands after platform Task 8 (which rewrites the `addPostgres` chain) and
  Task 2 after platform Task 11 (Aspire 13.6.4, or its labels go stale again). The `docs/deployment.md` edits here
  land after platform Tasks 5 to 7, cited by heading and quoted text, not line. AGENTS.md and `renovate.json5` are
  each touched by one task per plan; land one before the other.

---

### Task 1: Write the Compose backup and restore procedure

**Files:**

- Modify: `docs/deployment.md` (new `## 9. Backups` at the end of the file, after line 329; line 313 is a subsection
  inside section 8)

**Interfaces:** none.

- [ ] **Step 1: Write the section**

Compose, from the Compose directory. The published `pg` service initialises with `--auth-local=scram-sha-256`, so the
socket needs the password, and `-T` keeps a TTY from corrupting the custom-format dump:

```bash
docker compose exec -T pg sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -U postgres -Fc appdb' > appdb-$(date +%F).dump
```

Nightly from cron on the host (write `%` as `\%` in a crontab line), kept 14 days off the host. Restore with web
stopped:

```bash
docker compose stop web && docker compose exec -T pg sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" pg_restore -U postgres -d appdb --clean --if-exists' < appdb-<date>.dump && docker compose start web
```

State what the database holds (users, password hashes, OAuth tokens, sessions, site settings, playground rows) and
that the Umami schema rides along. Cluster: CNPG already runs a daily `ScheduledBackup` at 03:00 UTC through the
barman-cloud plugin with WAL archiving (home-cluster `kubernetes/apps/matherlynet/matherlynet/app/scheduledbackup.yaml`
and `cluster.yaml`), so the cluster section only names where backups go and how to restore (a new `Cluster` with
`bootstrap.recovery` from the object store).

- [ ] **Step 2: Test one restore locally**

With the Compose publish running locally (`aspire publish -o out/compose`, `docker compose up`): dump, `delete from
site_settings`, restore, and confirm the row is back through the same `exec -T pg sh -c` wrapper running
`psql -U postgres -d appdb -tc "select count(*) from site_settings"` (expected `1`; the reviewer measured this round
trip on postgres:18.3). Record the commands and output in the PR body.

- [ ] **Step 3: Commit**

```bash
git add docs/deployment.md
git commit -m "docs(deployment): backups and restore for Compose and the cluster"
```

### Task 2: Relabel the version-pinned workarounds

**Files:**

- Modify: `apphost.mts:182,194`; `AGENTS.md:182,231,232,260`; `docs/deployment.md:222`; `web/start.mjs:6`;
  `web/otel.mjs:9`; `web/astro.config.mjs:9`; `web/e2e/global-setup.ts:5,6`; `web/src/lib/playground-io.ts:261`;
  `web/src/lib/pwned.ts:6,17,33,149`; `web/src/lib/auth.ts:56,81,117`; `web/tests/auth-config.test.ts:17`;
  `web/tests/pwned.test.ts:350,465,489` (the full list is `git grep -nE "1\.7\.7|13\.6\.0-preview|8\.3\.1|7\.3\.8|0\.45\.3|10\.0\.13|0\.222"`)
- Modify: `.claude/rules/web-architecture.md` and `.claude/rules/database.md` (receive the moved paragraphs)
- Modify: `.claude/skills/bump-deps/SKILL.md` (add the sweep)

Land after platform Task 11 (Aspire 13.6.4) and after Task 4 of this plan (which edits `claim()` beside line 261).

**Interfaces:** none.

- [ ] **Step 1: Re-check each workaround on the installed version**

For each label (Aspire.Hosting.Kubernetes 13.6.0-preview, Vite 8.3.1, Astro 7.3.8, better-auth 1.7.7 at 13 sites,
drizzle-orm 0.45.3, nodemailer 10.0.13, OpenTelemetry 0.222), read the installed source under `web/node_modules`
(or run the behaviour: the probe-scheme fix at `apphost.mts:185` still has work on 13.6.2-preview.1, measured by the
audit) and write the result in a table in the PR body: still needed, or retire.

- [ ] **Step 2: Rewrite the labels**

Form: `checked on <package> <installed version>`. Where a workaround can retire, delete it and its comment in the
same PR, with the test that covered it updated.

- [ ] **Step 3: Fix the false AGENTS.md claim**

`AGENTS.md:182`: the gate and party counts are enforced by `Row<typeof CALLERS>` and `Gateway<typeof AI_GATES>`,
whose fields use the private `Per<T, V>` mapped type in `gateway-path.ts:41`. Then move, not cut: the rule files hold
none of this today (`grep -cF` for `SMIL`, `times()`, `vitest -u`, `routed_at`, `IN_FLIGHT_MAX` is 0 in both). Move
the gateway-figure and snapshot paragraphs (AGENTS.md lines 165 to 192) verbatim into
`.claude/rules/web-architecture.md` and the `playground_call` rule (line 335) into `.claude/rules/database.md`, leave
a one-line pointer in AGENTS.md for each, and confirm each term above now matches in its destination.

- [ ] **Step 4: Add the sweep to /bump-deps**

In `.claude/skills/bump-deps/SKILL.md`, a final step: `git grep -nE "checked on [A-Za-z0-9@/._-]+ [0-9]"` (uppercase
and digits so `Aspire.Hosting.Kubernetes` matches) and re-check every hit whose package the bump touched.

- [ ] **Step 5: Run the checks and commit**

Run: `markdownlint-cli2 && cd web && pnpm check && pnpm lint && pnpm test`. Expected: clean.

```bash
git add apphost.mts AGENTS.md docs/deployment.md web/astro.config.mjs web/e2e/global-setup.ts web/start.mjs web/otel.mjs web/src/lib web/tests .claude/rules .claude/skills/bump-deps/SKILL.md
git commit -m "docs: date the version-pinned workarounds and fix the gateway type claim"
```

(Not `git add -A`: the tree may hold untracked plan files.)

### Task 3: Test the three untested flows

**Files:**

- Modify: `web/e2e/account.spec.ts` (a revoke test after line 73, where the sign-out test ends)
- Create: `web/tests/admin-page.test.ts`

**Interfaces:**

- Consumes: the Container API and the `locals` shape from `pages.test.ts:18-23`; `saveSiteSettings` and
  `readSiteSettings` from `web/src/lib/site-settings`; `NotFound` from `web/src/pages/404.astro`.

- [ ] **Step 1: Pool listeners and timeouts**

Already covered: `playground-io.test.ts:541-567` asserts one connection per admitted call, both pools' `error`
listeners and the 5 s, 10 s and 15 s timeouts, and that a client emitting `error` after `connect` does not throw
(`vitest run tests/playground-io.test.ts -t "claim|pool"`: 16 pass). Audit finding 16 is wrong on this point; no
new test.

- [ ] **Step 2: E2E session revocation**

After line 73 in `account.spec.ts`: open a second context with `browser.newContext({ userAgent: "e2e-other" })` and
sign in there (rows on /account are labelled by user agent only, `account.astro:52`, and earlier serial tests leave
extra sessions). On /account revoke the row whose text contains `e2e-other`; the second context's `/account` then
redirects to `/sign-in`. For the three-context case click `Sign out other devices` (`account.astro:75`).

- [ ] **Step 3: Admin page test**

Mock the settings module, not the database: `vi.hoisted` plus
`vi.mock("../src/lib/site-settings", async (orig) => ({ ...(await orig()), saveSiteSettings, readSiteSettings }))`.
Render with `locals` as in `pages.test.ts:18-23` plus `user: { role: "admin" }` (the gate reads
`Astro.locals.user.role`; `siteSettings` and `theme` are required by the layout). Register the 404 page first,
`container.insertPageRoute("/404", NotFound)`, because the non-admin case ends in `Astro.rewrite("/404")` and throws
`Couldn't find component for route /404` without it. Cases: GET as admin renders the form with the row's values; a
POST (`FormData` body in `new Request(url, { method: "POST", body })`) with an invalid palette answers 200 with the
error and no `saveSiteSettings` call; a valid POST calls it once and answers 303 to `/admin?saved`; a non-admin
answers 404. The reviewer probed the first three with a scratch Vitest config and they behave as stated.

- [ ] **Step 4: Run**

Run: `cd web && pnpm test` and, with the stack up, `env -u NODE_ENV pnpm e2e e2e/account.spec.ts`.
Expected: PASS, with the new tests listed.

- [ ] **Step 5: Commit**

```bash
git add web/tests web/e2e/account.spec.ts
git commit -m "test: pool listeners, session revocation and the admin page"
```

### Task 4: Hold the daily playground cap at claim time

**Files:**

- Modify: `web/src/lib/playground-io.ts:260-282` (`claim()`'s UPDATE)
- Modify: `web/tests/playground-io.test.ts:463-481`

**Interfaces:**

- Consumes: `LIVE.sitePerDay` (300) from `web/src/lib/playground.ts`.

- [ ] **Step 1: Write the failing test**

`claim()` runs on a pool client, so its SQL reaches the fake client's `query`, not `execute`
(`playground-io.test.ts:455-472`), and drizzle binds `${LIVE.sitePerDay}` as a `$n` placeholder. A `claim` test that
reads `fake.query.mock.calls`, asserts the UPDATE's `text` contains `routed_at > now() - interval '1 day'` and its
`values` contain `LIVE.sitePerDay`. The "no row returns false" case already exists at lines 475 to 479.

Run: `cd web && pnpm vitest run tests/playground-io.test.ts -t claim`. Expected: FAIL on the text match.

- [ ] **Step 2: Add the predicate**

In the UPDATE's `where`, after the seat subquery:
`and (select count(*) from playground_call where routed_at > now() - interval '1 day') < ${LIVE.sitePerDay}`.
Update the `Io.claim` doc comment at `playground-io.ts:182-185` ("only while fewer than LIVE.seats open routed rows
exist"), which is the one that goes stale.

- [ ] **Step 3: Run the unit tests and the live E2E**

Run: `cd web && pnpm test`, then with the fake model (`node web/tests/fake-llama.ts 18080`, the secret set, the
stack restarted) `env -u NODE_ENV pnpm e2e e2e/live.spec.ts`.
Expected: PASS, unchanged behaviour: the seeded 300 rows are refused at `open()` ("site daily") before `claim()`
runs, so the unit test is the proof. Accept that the rare call refused by the new predicate shows the "seats taken"
message once; its next call is refused "site daily" at `open()`.

- [ ] **Step 4: Commit**

```bash
git add web/src/lib/playground-io.ts web/tests/playground-io.test.ts
git commit -m "fix(playground): enforce the daily cap when a seat is claimed"
```

### Task 5: Drop dead package configuration

**Files:**

- Modify: `web/pnpm-workspace.yaml:5-22` (delete `minimumReleaseAgeExclude`)
- Modify: `web/package.json:43-45` (delete `allowScripts`)
- Modify: `.github/renovate.json5` (add `"pre-commit": { enabled: true }`)
- Modify: `web/.dockerignore` (add `.env*`)

**Interfaces:** none.

- [ ] **Step 1: Delete and reinstall**

Run: `cd web && pnpm install --frozen-lockfile && git status --short`.
Expected: install succeeds and `pnpm-lock.yaml` is unchanged (the 17 excluded versions are all older than a day).

- [ ] **Step 2: Enable Renovate's pre-commit manager**

Add the top-level key `"pre-commit": { enabled: true }`. Validate from the repo root:

```bash
npx --yes --package renovate -- renovate-config-validator --strict
```

Expected: `Config validated successfully` (measured on a scratch copy; `npx renovate-config-validator` alone pulls
an unrelated placeholder package). Renovate's next run opens a PR for the markdownlint hook pin when one is due.

- [ ] **Step 3: Exclude `.env*` from the image context**

Append `.env*` to `web/.dockerignore`. Check: `touch web/.env.local && DEPLOY_TARGET=k8s aspire publish -o out/k8s
&& docker build -f out/k8s/web.Dockerfile -t ctx-check web && docker run --rm --entrypoint ls ctx-check -a /app |
grep -c '^.env'` prints 0; remove `web/.env.local`.

- [ ] **Step 4: Commit**

```bash
git add web/pnpm-workspace.yaml web/package.json .github/renovate.json5 web/.dockerignore
git commit -m "chore: drop dead pnpm config, keep .env files out of the image, track the pre-commit pin"
```

### Task 6: Tighten repository settings (decide, then apply)

**Files:** none in the repo.

- [ ] **Step 1: Jason applies, in GitHub settings or with `gh api`**

Today (read-only `gh api`): `can_approve_pull_request_reviews: true`, `default_workflow_permissions: read`,
`sha_pinning_required: false`, one ruleset (`Protect main`). Apply:

```bash
gh api -X PUT repos/jrmatherly/matherlynet/actions/permissions -F enabled=true -f allowed_actions=all -F sha_pinning_required=true
```

```bash
gh api -X PUT repos/jrmatherly/matherlynet/actions/permissions/workflow -f default_workflow_permissions=read -F can_approve_pull_request_reviews=false
```

Then a ruleset on `v*` tags that blocks deletion and non-fast-forward updates (Settings, Rules, or the rulesets API).

- [ ] **Step 2: Record it**

One line in `SECURITY.md` or `docs/deployment.md`: the three settings and the date.

### Task 7: Bump the pinned infrastructure versions

**Files:**

- Modify: `apphost.mts:88-89` (`.withImageTag('18.6')` on `addPostgres('pg')`), the dashboard image if a stable tag
  is chosen (`apphost.mts:26-35`), `scripts/smoke-image.sh:55`

**Interfaces:** none.

- [ ] **Step 1: Pin Postgres 18.6 in both places and publish**

After platform Task 8 lands, add `.withImageTag('18.6')` to its `pg` chain (`postgres:18.6` exists on Docker Hub,
checked). Run: `aspire publish -o out/compose && grep -n 'postgres:' out/compose/docker-compose.yaml` prints `18.6`;
`DEPLOY_TARGET=k8s aspire publish -o out/k8s && scripts/smoke-image.sh out/k8s/web.Dockerfile` passes on 18.6.

- [ ] **Step 2: The dashboard**

The published Compose dashboard comes from the nightly repo (`mcr.microsoft.com/dotnet/nightly/aspire-dashboard:13.6`,
which stops at 13.6.1); MCR's stable `dotnet/aspire-dashboard` has `13.6` and `13.6.2`. Default: inside the existing
`configureDashboard` callback (`apphost.mts:28-35`),
`await dashboard.withImage('mcr.microsoft.com/dotnet/aspire-dashboard', { tag: '13.6' })`. Check:
`aspire publish -o out/compose && grep -n aspire-dashboard out/compose/docker-compose.yaml` prints the stable image.
(`aspire start` uses the CLI's own dashboard and checks nothing here.)

- [ ] **Step 3: Node 26**

Out of scope here. Open a separate plan when `node:26-alpine` and `@types/node` 26 are both a week old and
`@astrojs/node` lists 26 in its engines.

- [ ] **Step 4: Commit**

```bash
git add apphost.mts scripts/smoke-image.sh
git commit -m "chore(apphost): Postgres 18.6"
```

### Task 8: Decisions recorded, no code

- [ ] **HIBP in the release gate (finding 15).** Accept: E2E sign-up and reset call the live API, which has been up
  for every run so far; `account.spec.ts` already allows 15 s. Record in `.claude/rules/web-architecture.md`'s
  e2e line that a HIBP outage fails E2E and the retry is to re-run the job. Revisit with a `PWNED_RANGE_URL`
  parameter if it ever fails twice.
- [ ] **Served source maps (finding 18).** Accept: the repo is public, and `docs/deployment.md:128-130` already
  documents the Cloudflare WAF rule that blocks `*.map`. Jason confirms the rule exists in the zone and dates the
  line.
- [ ] **`rate_limit` rows and unverified sign-ups (finding 22).** Accept at this traffic; add one sentence to
  `docs/deployment.md` section 7's Database subsection naming the two tables and the `delete` to run if they grow.
- [x] **npm token (finding 24).** Closed by the owner and no longer tracked; nothing in the repo or history holds it
  (audit, gitleaks and `git log -p -G` checked).

### Task 9: Verify and open the PRs

- [ ] `/verify --no-stack` after Tasks 2, 4, 5 and 7; the full `/verify` after Task 3.
- [ ] One PR per task, template filled, pushed on Jason's go.
