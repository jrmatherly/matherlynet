---
name: verify
description: Runs matherlynet's full local verification (AppHost eslint and tsc, Markdown and workflow lint, web astro check and build, Aspire smoke test) and reports PASS/FAIL per step. Use before committing, after changing apphost.mts, dependencies or the auth/database code, or when the user says "verify", "run the checks", "is everything green", or invokes /verify.
argument-hint: "[--no-stack]"
allowed-tools: Bash(.claude/skills/verify/scripts/verify.sh *)
---

# Verify

Run the project's checks and report the result.

1. Run `.claude/skills/verify/scripts/verify.sh $ARGUMENTS` from the repo root. Pass `--no-stack` to skip the
   Aspire smoke test (for docs-only or workflow-only changes).
2. Report the PASS/FAIL table. For each FAIL, show the excerpt the script printed and fix the cause; rerun
   until everything passes or the cause is outside your change.

## Gotchas

- The smoke test reuses a running AppHost and leaves it running; otherwise it starts the stack and stops it after.
- A FAIL on "Aspire smoke test" with certificate errors in `aspire logs` means the dev certificate isn't
  trusted: ask the user to run `aspire certs trust` (interactive).
- The web build needs no database; a build failure is a code problem, not an environment one.
