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
   until everything passes or the cause is outside your change.

## Gotchas

- The stack steps reuse a running AppHost and leave it running; otherwise they start the stack and stop it after.
- A FAIL on "Web E2E" where a page's form does nothing (native POST, `504 Outdated Optimize Dep` in the browser
  console) is a stale Vite dev cache: `aspire resource web restart`, then rerun. Playwright needs Chromium once:
  `pnpm --dir web exec playwright install chromium`. Failure traces land in `web/test-results/`.
- A FAIL on "Aspire smoke test" with certificate errors in `aspire logs` means the dev certificate isn't
  trusted: ask the user to run `aspire certs trust` (interactive).
- The web build needs no database; a build failure is a code problem, not an environment one.
