#!/bin/bash
#
# Full local verification for matherlynet. Prints PASS/FAIL per step and exits
# non-zero if any step failed. Usage: verify.sh [--no-stack]
#   --no-stack  skip the Aspire smoke test and Playwright E2E (static checks only)

set -uo pipefail
# Aspire runs `npm install` before each AppHost run; with NODE_ENV=production (inherited from some editor
# launches) that prunes typescript/tsx and every aspire command fails with "npx canceled ... tsc".
unset NODE_ENV
cd "${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}" || exit 1

results=()
failed=0
step() {
  local name=$1; shift
  local out
  if out=$("$@" 2>&1); then
    results+=("PASS  $name")
  else
    results+=("FAIL  $name")
    failed=1
    printf '\n--- %s ---\n%s\n' "$name" "$(printf '%s\n' "$out" | tail -25)"
  fi
}

step "AppHost eslint"       npm run --silent lint
step "AppHost tsc"          node_modules/.bin/tsc -p tsconfig.apphost.json --noEmit
step "Markdown lint"        markdownlint-cli2
step "Workflow lint"        actionlint
step "Web astro check"      pnpm --dir web check
step "Web lint"             pnpm --dir web lint
step "Web tests"            pnpm --dir web test
step "Web build"            pnpm --dir web build

smoke() {
  aspire wait web --non-interactive --nologo >/dev/null &&
    curl -fsS --max-time 10 http://localhost:4321/api/auth/ok | grep -q '"ok":true'
}
# A reused dev server that re-optimized dependencies serves stale chunks (504 Outdated Optimize Dep) until
# restarted, so page scripts never run. On a reused stack, retry once after restarting web; a real failure fails
# again. Playwright's output doesn't show the browser's 504, so any failure qualifies: a pass after the retry is
# reported as a NOTE with the first run's log, so a genuinely flaky test doesn't hide behind a plain PASS.
e2e_first_log=$(mktemp -t verify-e2e)
e2e() {
  pnpm --dir web e2e >"$e2e_first_log" 2>&1 && return
  if [ "$started" != 0 ]; then cat "$e2e_first_log"; return 1; fi
  aspire resource web restart --non-interactive --nologo >/dev/null &&
    aspire wait web --non-interactive --nologo >/dev/null &&
    pnpm --dir web e2e && touch "$e2e_first_log.retried"
}
if [ "${1:-}" != "--no-stack" ]; then
  # Reuse a running AppHost; otherwise start one for these steps and stop it after. started: 0 reused, 1 started
  # here, failed (a failed start isn't a reused stack: no retry).
  started=0
  if ! aspire ps --non-interactive --nologo 2>/dev/null | grep -q apphost.mts; then
    if aspire start --non-interactive --nologo >/dev/null; then started=1; else started=failed; fi
  fi
  step "Aspire smoke test"  smoke
  step "Web E2E"            e2e
  if [ -e "$e2e_first_log.retried" ]; then
    results+=("NOTE  Web E2E passed only after restarting web (stale Vite deps?); first run: $e2e_first_log")
  fi
  [ "$started" = 1 ] && aspire stop --non-interactive --nologo >/dev/null
fi

printf '\n'
printf '%s\n' "${results[@]}"
exit $failed
