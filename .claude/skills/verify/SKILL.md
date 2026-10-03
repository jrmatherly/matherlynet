---
name: verify
description: Runs matherlynet's full local verification (AppHost eslint and tsc, Markdown and workflow lint, web astro check, lint, tests and build, Aspire smoke test, Playwright E2E) and reports PASS/FAIL per step. Use before committing, after changing apphost.mts, dependencies or the auth/database code, or when the user says "verify", "run the checks", "is everything green", or invokes /verify.
argument-hint: "[--no-stack]"
allowed-tools: Bash(.claude/skills/verify/scripts/verify.sh *)
---

# Verify

Run the project's checks and report the result.

1. Run `.claude/skills/verify/scripts/verify.sh $ARGUMENTS` from the repo root. Pass `--no-stack` to skip the
   Aspire smoke test and Playwright E2E (for docs-only or workflow-only changes).
2. Report the PASS/FAIL table. For each FAIL, show the excerpt the script printed and fix the cause; rerun
   until everything passes or the cause is outside your change. Excerpts print before the table, so save the full
   output to a file (`| tee`) rather than `| tail` it away. While fixing, rerun only the failed step's command
   (E2E: `cd web && env -u NODE_ENV pnpm e2e`), then one final full run.

## Gotchas

- The stack steps reuse a running AppHost and leave it running; otherwise they start the stack and stop it after.
- A page's form doing nothing in E2E (native POST, `504 Outdated Optimize Dep` on a `.vite/deps` chunk) is a stale
  Vite dev cache. On a reused stack the script restarts `web` and retries E2E once by itself; a FAIL that survives
  the retry is real. A NOTE (passed only after the restart) is a flake report, not proof of stale deps: it lists each
  first-run failure and how many kept first-run logs it also failed in. A test that keeps failing first is a race to
  fix on the branch (confirm with `pnpm exec playwright test <spec>:<line> --repeat-each=15`).
- The script unsets `NODE_ENV` (Aspire's `npm install` would prune dev dependencies under
  `NODE_ENV=production`); run other `aspire`/`npm` commands with `env -u NODE_ENV` too. Playwright needs Chromium once:
  `pnpm --dir web exec playwright install chromium`. Failure traces land in `web/test-results/`.
- A FAIL on "Aspire smoke test" with certificate errors in `aspire logs` means the dev certificate isn't
  trusted: ask the user to run `aspire certs trust` (interactive).
- The web build needs no database; a build failure is a code problem, not an environment one.
