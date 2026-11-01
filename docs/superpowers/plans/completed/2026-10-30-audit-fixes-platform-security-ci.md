# Audit Fixes, Platform, Security and CI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the high and medium findings of the 2026-10-30 audit that change how the site is deployed, protected
and checked: no zero-pod rollouts, vulnerabilities that CI sees, a CSP that a test exercises, no visitor IPs in
Sentry, a mail-flood rule, an admin runbook that resists pre-registration, a known TLS state for the cluster
database, a Compose Postgres that restarts, repo checks in CI, a schema-drift gate, and Aspire on 13.6.4.

**Architecture:** Each task is one PR with its own evidence, in the order below, which is risk first and dependency
aware. Three tasks land outside this repository's code: the rollout fix is a Flux patch in `~/dev/home-cluster`
(Aspire's Helm publisher exposes no Deployment strategy), the mail-flood rule is a Cloudflare rule (recorded in the
runbook), and the TLS decision starts with one query on the cluster. Everything else is a small change in this repo
with a unit test or a CI assertion that fails without it.

**Tech Stack:** Aspire 13.6 TypeScript AppHost, Astro 7 SSR, better-auth 1.7.11, @sentry/node 11.8.0, pg 8, Flux,
CloudNativePG, GitHub Actions, pnpm 12, Playwright.

**Spec:** `docs/superpowers/specs/completed/2026-10-30-project-audit.md`, findings 1, 2, 3, 4, 5, 8, 9, 11, 12, 13
and 14.
Pointer files from the planning session (scratch, not tracked) backed the line numbers; re-grep before editing.

## Global Constraints

- `apphost.mts` is the source of truth for infrastructure; never hand-edit generated output in `out/`, `.aspire/`
  or `web/drizzle/`.
- Never run `astro dev` directly; the stack runs through `aspire start`. After editing `web/astro.config.mjs` or web
  dependencies, `aspire resource web restart`.
- Dependencies stay exact-pinned; pnpm refuses versions under a day old without a `minimumReleaseAgeExclude` entry.
- GitHub Actions stay pinned to full commit SHAs with a `# vX.Y.Z` comment, keep per-job least-privilege
  permissions, the concurrency group, emoji step names, and pass `actionlint`.
- Markdown under 120 columns, top-level heading first, `markdownlint-cli2` clean.
- `/simplify` then `/code-review` before each commit; `/no-comments` before review. Commits are SSH-signed; if
  signing fails, leave the work staged.
- Don't push, publish images, deploy, or change Cloudflare or repository settings without Jason's go in chat. Reads
  of the production cluster go through `KUBECONFIG=~/dev/home-cluster/kubeconfig`, context `topf@kubernetes`,
  read-only, and this session's classifier refuses even those, so Jason runs them.
- Workflows that touch the image path trigger `publish-images.yml` on merge to main, which publishes a new chart;
  batch the CI edits so one chart version carries them.

## Review Focus

- A `pnpm audit` step that fails CI on every new advisory blocks unrelated PRs; the step uses `--audit-level=high`
  and the PR body says how to add an exclusion when an advisory has no fix.
- A CSP assertion that only checks the header exists would pass a CSP that blocks the site's own scripts; the
  built-server spec also fails on any console message containing `Content Security Policy`.
- Nothing in `web/src` calls `Sentry.setUser`, so `userInfo: false` changes only `ip_address`; the Sentry test asserts
  the event still carries the request URL and method so errors stay diagnosable.
- A spec under `web/e2e/` runs in every `pnpm --dir web e2e` (dev server, no CSP), so the CSP spec skips itself on a
  dev server; otherwise it fails `/verify` and CI E2E on every PR.
- `maxUnavailable: 0` with one replica needs `maxSurge: 1` (the chart already sets it) and a pod that can start while
  the old one serves; a failed migration then leaves the old pod up, which is the intent. The rollout watch in Task
  1 confirms a second pod existed before the first went away.
- Splitting `addPostgres('pg')` into a variable in `apphost.mts` changes nothing in the generated names only if the
  resource name string stays `pg`; the Compose grep in Task 8 pins the service name.

---

### Task 1: Stop zero-pod rollouts on the cluster

**Files:**

- Modify: `~/dev/home-cluster/kubernetes/apps/matherlynet/matherlynet/app/helmrelease.yaml:45-46` (the strategic-merge
  patch on `matherlynet-web-deployment`; `spec:` holds `template:` there)
- Modify: `docs/deployment.md:140-173` (section 7, Kubernetes)

**Interfaces:**

- Consumes: nothing.
- Produces: nothing in code; the runbook sentence Task 9's reader relies on.

- [ ] **Step 1: Record the current strategy as the failing state**

Jason runs:

```bash
kubectl --context topf@kubernetes get deploy matherlynet-web-deployment -n matherlynet -o jsonpath='{.spec.replicas} {.spec.strategy.rollingUpdate}'
```

Expected today: `1 {"maxSurge":1,"maxUnavailable":1}`.

- [ ] **Step 2: Add the strategy to the Flux patch**

In the home-cluster `helmrelease.yaml` patch, under the Deployment's `spec:` beside `template:`, add:

```yaml
strategy:
  rollingUpdate:
    maxUnavailable: 0
```

Validate with `flux build kustomization matherlynet --path ./kubernetes/apps/matherlynet/matherlynet/app` (or
the repo's own render check) and confirm the rendered Deployment shows `maxUnavailable: 0`.

- [ ] **Step 3: Add the runbook sentence**

In `docs/deployment.md` section 7, after the paragraph on the chart's objects, add one sentence: the chart ships
`maxUnavailable: 1` on a single replica, so an install must patch `maxUnavailable: 0` (Flux postRenderer or
`kubectl patch`) or every upgrade drops to zero ready pods.

- [ ] **Step 4: Commit in both repositories**

home-cluster: `chore(matherlynet): keep one pod ready through rollouts` (that session or Jason commits and pushes;
Flux applies it). This repo: `docs(deployment): require maxUnavailable 0 on the web Deployment`.

- [ ] **Step 5: Verify on the next rollout**

Jason runs, during the next chart bump, with `kubectl get pods -n matherlynet -w` in a second shell:

```bash
kubectl --context topf@kubernetes rollout status deploy/matherlynet-web-deployment -n matherlynet
```

Expected: a second web pod reaches `Running` before the old one terminates, and a loop of
`curl -s -o /dev/null -w '%{http_code}' https://matherly.net/` never returns a non-200 during the rollout.

### Task 2: Make dependency vulnerabilities visible in CI

**Files:**

- Modify: `.github/workflows/web-checks.yml:45-46` (after `📚 Install dependencies`)
- Modify: `.github/renovate.json5:18-19` (between `vulnerabilityAlerts` and `packageRules`)
- Modify: `web/pnpm-lock.yaml` (refreshed by pnpm, not by hand)
- Modify: `AGENTS.md` (the Dependencies rule, add one sentence)

**Interfaces:** none.

- [ ] **Step 1: Confirm the failing state**

Run: `cd web && pnpm audit --prod --audit-level=high; echo "exit=$?"`
Expected: 6 high, 4 moderate advisories (source-map-js, systeminformation, undici 8.x), nonzero exit.

- [ ] **Step 2: Refresh the transitive versions**

Run: `cd web && pnpm update undici source-map-js systeminformation && pnpm audit --prod --audit-level=high; echo "exit=$?"`
Expected: `exit=0`. If an advisory stays because a parent pins the range, add a `pnpm.overrides` entry in
`web/package.json` for that package at the fixed version and say so in the PR body.

- [ ] **Step 3: Add the CI step**

In `web-checks.yml` after the install step:

```yaml
      - name: 🛡️ Audit production dependencies
        run: pnpm audit --prod --audit-level=high
```

- [ ] **Step 4: Enable lockfile maintenance in Renovate**

In `renovate.json5` after line 18: `lockFileMaintenance: { enabled: true, schedule: ['before 6am on monday'] },`
Validate from the repo root (the validator is a bin inside the `renovate` package; `npx renovate-config-validator`
alone installs an unrelated placeholder package):

```bash
npx --yes --package renovate -- renovate-config-validator --strict
```

Expected: `Config validated successfully`. The housekeeping plan adds a `"pre-commit"` key to the same file; make
both edits in whichever PR lands first.

- [ ] **Step 5: Record the rule**

In `AGENTS.md`'s Dependencies rule add: CI fails on a high production advisory (`pnpm audit --prod
--audit-level=high` in web-checks); fix by `pnpm update <package>` or a `pnpm.overrides` entry.

- [ ] **Step 6: Run the web check and lint the workflow**

Run: `cd web && pnpm install --frozen-lockfile && pnpm check && pnpm lint && pnpm test && pnpm build` and
`actionlint`.
Expected: all PASS; `actionlint` prints nothing.

- [ ] **Step 7: Commit**

```bash
git add .github/workflows/web-checks.yml .github/renovate.json5 web/pnpm-lock.yaml web/package.json AGENTS.md
git commit -m "ci(web): fail on high production advisories and refresh the lockfile"
```

### Task 3: Exercise the production CSP in CI

**Files:**

- Modify: `.github/workflows/web-checks.yml:61-113` (the `🚦 Smoke-test the production server` step)
- Create: `web/e2e/csp.spec.ts`
- Modify: `scripts/smoke-image.sh:86-95` (after the `/api/auth/ok` wait)
- Modify: `.github/workflows/e2e.yml:92-94`
- Modify: `web/playwright.config.ts` (none expected; `E2E_BASE_URL` already drives `baseURL`)

**Interfaces:**

- Consumes: `E2E_BASE_URL` and `MAILPIT_URL` as `web/e2e/global-setup.ts` reads them (with `MAILPIT_URL` set it
  skips `aspire describe`; a built app has no Vite client, so it skips the HMR socket).
- Produces: `csp.spec.ts`, runnable against any server with `E2E_BASE_URL`.

- [ ] **Step 1: Assert the header in the existing production smoke**

In the `web-checks.yml` smoke step, after the `/api/auth/ok` wait, add:

```bash
          curl -sI "http://127.0.0.1:$PORT/" | grep -i '^content-security-policy:' | grep -q "frame-ancestors 'none'" || { echo "no CSP header on /"; exit 1; }
```

Run the step's commands locally against a production server started with the smoke step's own env:

```bash
cd web && pnpm build && NODE_ENV=production HOST=127.0.0.1 PORT=4321 BETTER_AUTH_URL=https://matherly.net BETTER_AUTH_SECRET=ci-only-not-a-real-secret-0123456789 APPDB_URI=postgresql://ci:ci@127.0.0.1:1/appdb node --import ./otel.mjs server.mjs
```

Expected: the grep passes; with `security.csp` commented out in `astro.config.mjs` it fails (restore it).

- [ ] **Step 2: Write the failing spec**

`web/e2e/csp.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

const pages = ["/", "/about", "/work", "/changelog", "/writing", "/playground", "/sign-in"];

// The dev server sends no CSP (astro.config.mjs); global-setup.ts detects it the same way.
test.beforeEach(async ({ request }) => {
  const html = await (await request.get("/")).text();
  test.skip(html.includes("/@vite/client"), "astro dev sends no CSP");
});

for (const path of pages) {
  test(`${path} sends the CSP and nothing on it is blocked`, async ({ page }) => {
    const violations: string[] = [];
    page.on("console", (m) => { if (/Content Security Policy/i.test(m.text())) violations.push(m.text()); });
    const response = await page.goto(path);
    expect(response?.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
    await page.waitForLoadState("networkidle");
    expect(violations).toEqual([]);
  });
}
```

- [ ] **Step 3: Run it against the dev server and against the build**

With the stack up: `cd web && env -u NODE_ENV MAILPIT_URL=http://127.0.0.1:1 pnpm e2e e2e/csp.spec.ts`
Expected: 7 skipped, each naming `astro dev`. Against the production server from Step 1 with
`E2E_BASE_URL=http://127.0.0.1:4321`: 7 passed. The failing-first proof is Step 1's grep with `security.csp`
commented out, not this run.

- [ ] **Step 4: Run it in the image smoke**

In `scripts/smoke-image.sh` after the `/api/auth/ok` loop, when `SMOKE_E2E=1`:

```bash
if [ "${SMOKE_E2E:-}" = 1 ]; then
  E2E_BASE_URL="http://$port" MAILPIT_URL=http://127.0.0.1:1 pnpm --dir web e2e e2e/csp.spec.ts || fail "CSP E2E failed against the image"
fi
```

`port` in that script is already `127.0.0.1:<port>` (line 85; its own curl uses `http://$port/...`). In `e2e.yml`'s
`🐳 Smoke-test the production image` step, set `SMOKE_E2E: '1'` in `env`. Playwright's browsers are already
installed earlier in that job.

- [ ] **Step 5: Run the image smoke locally**

Run: `aspire publish -o out/k8s` (with `DEPLOY_TARGET=k8s`) then `SMOKE_E2E=1 scripts/smoke-image.sh out/k8s/web.Dockerfile`.
Expected: the script's final line prints as before and the spec reports 7 passed.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/web-checks.yml .github/workflows/e2e.yml scripts/smoke-image.sh web/e2e/csp.spec.ts
git commit -m "ci: assert the production CSP and run the CSP spec against the image"
```

### Task 4: Keep visitor IPs and headers out of Sentry

**Files:**

- Modify: `web/src/lib/sentry.ts:85`
- Modify: `web/tests/sentry-wiring.test.ts:11-27` (the sink) and a new test

**Interfaces:**

- Consumes: `@sentry/core` 11.8.0 `DataCollection` (`userInfo?: boolean`, `httpHeaders?: { request?: boolean |
  { allow: string[] } | { deny: string[] } }`, `httpBodies?: HttpBodyCollectionTarget[]`).
- Produces: nothing.

- [ ] **Step 1: Extend the sink to keep event bodies**

In `sentry-wiring.test.ts`, `sink()` returns `{ envelopes, events, dsn }` where `events` is a counting function the
first test calls; keep it. Add `bodies: Record<string, unknown>[]`: for each envelope, when
`lines[i].includes('"type":"event"')`, push `JSON.parse(lines[i + 1])` (the event body is the line after its item
header).

- [ ] **Step 2: Write the failing test**

```ts
it("sends no visitor identity: no user.ip_address, no client IP headers, request url and method kept", async () => {
  const { dsn, bodies } = await sink();
  configureSentry(dsn);
  await Sentry.withIsolationScope(async () => {
    Sentry.getIsolationScope().setSDKProcessingMetadata({
      normalizedRequest: { url: "https://matherly.net/x", method: "GET", headers: { "cf-connecting-ip": "203.0.113.9", "user-agent": "t" } },
      ipAddress: "203.0.113.9",
    });
    Sentry.captureException(new Error("probe"));
    await Sentry.flush(2000);
  });
  const event = bodies.at(-1)! as { user?: { ip_address?: string }; request?: { url?: string; method?: string; headers?: Record<string, string> } };
  expect(event.user?.ip_address).toBeUndefined();
  expect(event.request?.headers?.["cf-connecting-ip"]).toBeUndefined();
  expect(event.request).toMatchObject({ url: "https://matherly.net/x", method: "GET" });
});
```

Run: `cd web && pnpm vitest run tests/sentry-wiring.test.ts -t "visitor identity"`
Expected: FAIL (`user.ip_address` is `203.0.113.9` and the header is present today; measured with a scratch probe on
@sentry/node 11.8.0, which reads `ipAddress` from the processing metadata in
`@sentry/core/build/esm/integrations/requestdata.js:53-58`).

- [ ] **Step 3: Change the data collection option**

`web/src/lib/sentry.ts:85`:

```ts
    dataCollection: { httpBodies: [], userInfo: false },
```

`userInfo: false` alone removes `user.ip_address` and deletes all twelve client-IP header names from the request
(`requestdata.js:166-182`, `vendor/getIpAddress.js`), and cookie keys are always filtered, so no deny list is
needed. Update the comment above it to say why (visitor IPs are personal data the site never stores elsewhere).

- [ ] **Step 4: Run the test and the suite**

Run: `cd web && pnpm vitest run tests/sentry-wiring.test.ts && pnpm test`
Expected: PASS.

- [ ] **Step 5: Verify live**

With the stack up and a Sentry DSN on /admin pointing at a local sink (the test's `sink()` logic as a 20-line
script in the scratchpad, or Mailpit-style `nc -l`), request a URL that throws (an admin route with a broken
settings row, or `/api/playground` with the model URL set to a refused port) and read the captured event.
Expected: no `user.ip_address`, no `cf-connecting-ip`, `request.url` present.

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/sentry.ts web/tests/sentry-wiring.test.ts
git commit -m "fix(sentry): stop sending visitor IPs and client headers"
```

### Task 5: Rate-limit the mail-sending auth routes at the edge

**Files:**

- Modify: `docs/deployment.md:131-133` (section 5, the rate limiting rule)

**Interfaces:** none.

- [ ] **Step 1: Extend the runbook rule**

Beside the `/api/playground` rule, add a second Cloudflare rate limiting rule: `POST` to `/api/auth/sign-up/email`,
`/api/auth/request-password-reset` (the route `forgot-password.astro` calls through `requestPasswordReset`; add the
older alias `/api/auth/forget-password` if you want it covered), `/api/auth/send-verification-email` and
`/api/auth/sign-in/email`, about 5 requests per 10 minutes per address, action Block. State why: better-auth's own
limits are per IP and path (3 per 10 s on sign-in and sign-up, 3 per 60 s on reset and resend;
`api/rate-limiter/index.mjs:308-317` in 1.7.11), nothing per recipient, so one client signing in to an unverified
account (`sendOnSignIn: true`) can send about 18 verification mails a minute to one address through the owner's
SMTP account. A repeated sign-up for an existing email sends nothing.

- [ ] **Step 2: Jason creates the rule and records the date**

In the Cloudflare dashboard for `matherly.net`. Then in the same runbook paragraph: `Created on <date>.`

- [ ] **Step 3: Verify from outside the home network**

Run, from a non-home address:

```bash
for i in $(seq 1 7); do curl -s -o /dev/null -w '%{http_code}\n' -X POST https://matherly.net/api/auth/request-password-reset -H 'content-type: application/json' -d '{"email":"nobody@example.test","redirectTo":"/reset-password"}'; done
```

Expected: the last responses are Cloudflare's block (403 or 429), not 200.

- [ ] **Step 4: Commit**

```bash
git add docs/deployment.md
git commit -m "docs(deployment): rate-limit the mail-sending auth routes at Cloudflare"
```

### Task 6: Close the admin pre-registration path

**Files:**

- Modify: `web/src/lib/auth.ts:77-78` (the verification mail body)
- Modify: `web/tests/admin-promotion.test.ts` (the test at line 86 captures the mail)
- Modify: `docs/deployment.md:69-71`

**Interfaces:** none.

- [ ] **Step 1: Write the failing test**

In `admin-promotion.test.ts`, in the test at line 86 (mails are captured as `h.mails: { to, body }[]`), add:

```ts
expect(h.mails.filter((m) => m.to === ADMIN).at(-1)!.body).toContain("If you didn't sign up, ignore this email");
```

Run: `cd web && pnpm vitest run tests/admin-promotion.test.ts -t "emailed link"`
Expected: FAIL.

- [ ] **Step 2: Change the mail body**

`auth.ts:78`, the template string:

```text
Confirm your email to finish signing up for matherlynet:\n\n${url}\n\nIf you didn't sign up, ignore this email.
```

- [ ] **Step 3: Run the test**

Expected: PASS.

- [ ] **Step 4: Write the runbook step**

In `docs/deployment.md` after line 71: on every new database, the owner registers `ADMIN_EMAIL` and verifies it
before the site is exposed, because sign-up is open and anyone who registers that address first holds the row; a
verification link the owner did not request must be ignored, since clicking it verifies, signs in and promotes
whoever set the password.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/auth.ts web/tests/admin-promotion.test.ts docs/deployment.md
git commit -m "fix(auth): tell unexpected recipients to ignore the verification mail"
```

### Task 7: Decide and document database TLS for the cluster

**Files:**

- Modify: `docs/deployment.md:176-178` (the URI shape) and section 7's Database subsection
- Possibly modify: `~/dev/home-cluster/kubernetes/apps/matherlynet/matherlynet/app/helmrelease.yaml:11-17` (the
  secret the URI comes from)

**Interfaces:** none.

- [ ] **Step 1: Jason measures the current state**

Run:

```bash
kubectl --context topf@kubernetes exec -n matherlynet matherlynet-db-1 -c postgres -- env PGOPTIONS='-c default_transaction_read_only=on' psql -X -d app -tA -c "select a.usename, s.ssl, count(*) from pg_stat_ssl s join pg_stat_activity a using (pid) where a.datname='app' group by 1,2"
```

Expected: `app | f | <n>`. CNPG's `-app` secret builds its `uri` with no query string (`pkg/specs/secrets.go`,
`buildPostgres`), the Flux values feed that key straight in (`helmrelease.yaml:14-17`), and pg 8 with no `sslmode`
and no `ssl` option opens a plain TCP connection, so web talks to Postgres in clear text inside the cluster today. A
`t` means the secret was edited by hand; the decoded `uri` key of secret `matherlynet-db-app` (`kubectl get secret`,
`jsonpath='{.data.uri}'`, `base64 -d`) shows which.

- [ ] **Step 2: Turn TLS on through the environment**

The URI is CNPG's, so nothing can append `?sslmode=` to it. node-postgres reads `PGSSLMODE` from the environment
when the URI carries no `sslmode` and no `ssl` option is passed (`pg/lib/connection-parameters.js:25-37`); all three
pools (`web/src/db/index.ts:11`, `web/migrate.mjs:23`) pass `connectionString` only, so one variable covers them.
Default: in the Flux patch on the `web` container, mount secret `matherlynet-db-ca` key `ca.crt` at
`/etc/cnpg/ca.crt` and set `PGSSLMODE=require` plus `NODE_EXTRA_CA_CERTS=/etc/cnpg/ca.crt` (`require` in pg 8
verifies the chain, and pg reads no `PGSSLROOTCERT`, so the CA goes into Node's trust store). Alternative:
`PGSSLMODE=no-verify` (encrypted, unverified). Record which in the runbook with the query above as the check.

- [ ] **Step 3: Document the pg 8 behaviour**

In `docs/deployment.md` line 178: node-postgres 8's `sslmode=require` verifies the certificate (libpq does not), it
ignores `sslrootcert`, and it takes `PGSSLMODE` from the environment when the URI has none; the query above shows
the live state.

- [ ] **Step 4: Commit**

```bash
git add docs/deployment.md
git commit -m "docs(deployment): state the database TLS mode and how to check it"
```

### Task 8: Give the Compose Postgres a restart policy

**Files:**

- Modify: `apphost.mts:88-92` and the Compose block near lines 161-167
- Modify: `.github/workflows/e2e.yml:82-90` (the publish check)

**Interfaces:**

- Consumes: `publishAsDockerComposeService` as `web` uses it at `apphost.mts:161-167`
  (`service.restart.set('unless-stopped')`).
- Produces: a `pg` variable holding the server resource; `appdb` stays the database resource.

- [ ] **Step 1: Write the failing CI assertion**

In `e2e.yml`'s publish check, the step already runs `docker compose … config` (line 88); extend it:

```bash
          WEB_IMAGE=x PG_PASSWORD=x docker compose --project-directory out/compose config --format json | jq -e '.services.pg.restart == "unless-stopped"' > /dev/null || { echo "pg has no restart policy"; exit 1; }
```

(Aspire writes `restart:` last in a service block, after `volumes:`, so a line-count grep cannot reach it.) Run
`aspire publish -o out/compose` locally and the same command. Expected: fails today.

- [ ] **Step 2: Split the resource and set the policy**

In `apphost.mts` lines 88 to 92, keep the server in a variable and keep `POSTGRES_DB`, which published Compose needs:

```ts
const pg = k8s ? undefined : await builder.addPostgres('pg');
const appdb = pg ? await pg.withDataVolume().withEnvironment('POSTGRES_DB', 'appdb').addDatabase('appdb') : undefined;
```

Inside the existing `!k8s` guard, in the shape of line 114:

```ts
await pg!.publishAsDockerComposeService(async (_resource, service) => { await service.restart.set('unless-stopped'); });
```

The resource name stays `'pg'`, so volume and service names do not change.

- [ ] **Step 3: Lint, type-check, publish both targets**

Run:

```bash
npm run lint && npx tsc -p tsconfig.apphost.json --noEmit && aspire publish -o out/compose && DEPLOY_TARGET=k8s aspire publish -o out/k8s && scripts/check-chart.sh out/k8s
```

Expected: all clean; the Compose grep now passes; the chart is unchanged (`diff -r` against a publish from `main`
shows no difference under `out/k8s/templates`).

- [ ] **Step 4: Commit**

```bash
git add apphost.mts .github/workflows/e2e.yml
git commit -m "feat(apphost): restart the Compose Postgres like web"
```

### Task 9: Run the repo checks in CI

**Files:**

- Create: `.github/workflows/repo-checks.yml`
- Modify: `.github/pull_request_template.md` (the /verify line, if it claims CI runs these)

**Interfaces:**

- Consumes: the Aspire CLI install step from `e2e.yml:53-63` (copy it; `tsc` needs `aspire restore` for
  `.aspire/modules`), `npm run lint`, `node_modules/.bin/tsc -p tsconfig.apphost.json --noEmit`,
  `markdownlint-cli2`, `actionlint` (as `.claude/skills/verify/scripts/verify.sh:27-30` runs them).

- [ ] **Step 1: Write the workflow**

One job, `ubuntu-latest`, `permissions: contents: read`, on `pull_request` for paths `apphost.mts`,
`package.json`, `package-lock.json`, `tsconfig.apphost.json`, `aspire.config.json`, `**/*.md`,
`.github/workflows/**`, plus `workflow_dispatch`. Steps with emoji names: checkout, Node 24, `npm ci`, install the
pinned Aspire CLI and `aspire restore`, `npm run lint`, `tsc`, `npx --yes markdownlint-cli2@<version>`,
`actionlint` (pin the `rhysd/actionlint` action or install the binary by SHA-pinned release). Pin markdownlint-cli2
to the same version the pre-commit hook freezes (`.pre-commit-config.yaml:11`, v0.23.3 today) and add a
`customManagers` regex entry for it in `renovate.json5` like the `npx --yes sentry@` one (lines 66 to 74), so the
two pins move together.

- [ ] **Step 2: Make it fail once on purpose**

Push a branch with a 121-column line in a Markdown file; expected: the job fails on markdownlint. Revert.

- [ ] **Step 3: Lint and commit**

Run: `actionlint`. Expected: nothing printed.

```bash
git add .github/workflows/repo-checks.yml .github/pull_request_template.md
git commit -m "ci: lint the AppHost, Markdown and workflows on pull requests"
```

### Task 10: Gate schema drift and the upgrade path

**Files:**

- Modify: `.github/workflows/web-checks.yml` (a step after Astro check)
- Modify: `scripts/smoke-image.sh:94-95`
- Modify: `.github/workflows/e2e.yml:92-94` (pass the previous image)

**Interfaces:**

- Consumes: `cd web && APPDB_URI=postgresql://unused pnpm db:generate`; the journal at
  `web/drizzle/meta/_journal.json` (6 entries today).
- Produces: `SMOKE_FROM_IMAGE` in `smoke-image.sh`.

- [ ] **Step 1: Add the drift step**

```yaml
      - name: 🧬 Schema and migrations agree
        run: APPDB_URI=postgresql://unused pnpm db:generate && git diff --exit-code -- src/db drizzle
```

Run locally. Expected: clean today. Then change a column in `web/src/db/schema.ts`, run again; expected: the diff
fails the step. Revert.

- [ ] **Step 2: Tighten the migration count**

`smoke-image.sh:95` (the script runs from the repository root; no `root` variable exists):

```bash
expected=$(node -p "require('./web/drizzle/meta/_journal.json').entries.length")
[ "$migrations" -eq "$expected" ] || fail "$migrations migrations applied, journal has $expected"
```

- [ ] **Step 3: Add the upgrade run**

In `smoke-image.sh`, when `SMOKE_FROM_IMAGE` is set, before the new image's serving run: start `$SMOKE_FROM_IMAGE`
against the same Postgres with the same env, wait for `/api/auth/ok`, stop it. The new image then migrates a
database that already holds the previous release's schema and rows (seed one `user` row through `psql` between the
two runs so a migration that rewrites `user` meets data). In `e2e.yml`, set `SMOKE_FROM_IMAGE` to the image of the
latest release: `ghcr.io/jrmatherly/matherlynet/web:$(gh release view --json tagName -q .tagName | ...)` is
indirect; read it from the latest chart's `appVersion` with `helm show chart oci://ghcr.io/jrmatherly/matherlynet/charts/matherlynet`
and tag `web:<appVersion>`.

- [ ] **Step 4: Run the smoke locally with the current release as the previous image**

Run:

```bash
SMOKE_FROM_IMAGE=ghcr.io/jrmatherly/matherlynet/web:df0a7c10be0b6f3202120a98ec85d08d81c4fb69 scripts/smoke-image.sh out/k8s/web.Dockerfile
```

Expected: both runs serve, the final migration count equals 6, the seeded row survives.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/web-checks.yml .github/workflows/e2e.yml scripts/smoke-image.sh
git commit -m "ci: fail on schema drift and smoke the upgrade from the last release"
```

### Task 11: Move Aspire to 13.6.4

**Files:**

- Modify: `aspire.config.json`, `.github/workflows/e2e.yml:57-58`, `.github/workflows/publish-images.yml:81-82`,
  `.aspire/modules` (regenerated), `docs/*.md` where the version is named

**Interfaces:** the `/bump-deps` skill (`.claude/skills/bump-deps/SKILL.md`, Aspire section from line 42).

- [ ] **Step 1: Run `/bump-deps` for Aspire only**

Follow the skill: CLI through mise, `aspire update`, `aspire restore`, new CLI SHA-512 in both workflows.

- [ ] **Step 2: Verify**

Run:

```bash
npm run lint && npx tsc -p tsconfig.apphost.json --noEmit && aspire start && curl -s http://localhost:4321/api/auth/ok
```

```bash
aspire publish -o out/compose && DEPLOY_TARGET=k8s aspire publish -o out/k8s && scripts/check-chart.sh out/k8s
```

Expected: `{"ok":true}` and clean publishes; `diff -r` of `out/k8s/templates` against a `main` publish shows only
changes the release notes explain.

- [ ] **Step 3: Commit**

```bash
git add aspire.config.json .github/workflows
git commit -m "chore(aspire): 13.6.4"
```

### Task 12: Verify, release and deploy

- [ ] `/verify` with the stack up: every step PASS.
- [ ] Open one PR per task above (or stack them in this order), each with its evidence in the template.
- [ ] After merge, the publish workflow builds the image and chart; tag `v<chart version>` signed and create the
  release as `docs/deployment.md` describes; then Task 1's rollout watch on the deploy.

## Open decisions for Jason

- Task 5's thresholds (5 per 10 minutes is a starting point; his own sign-ins count against it).
- Task 7's TLS mode once the query shows the state.
- Whether Task 10's upgrade smoke pulls the previous image in CI on every PR (about 30 s and a GHCR pull) or only on
  `main`.
