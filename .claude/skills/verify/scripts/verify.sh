#!/bin/bash
#
# Full local verification for matherlynet. Prints PASS/FAIL per step and exits
# non-zero if any step failed. Usage: verify.sh [--no-stack]
#   --no-stack  skip the Aspire smoke test (static checks only)

set -uo pipefail
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

step "AppHost eslint"        npm run --silent lint
step "AppHost tsc"           node_modules/.bin/tsc -p tsconfig.apphost.json --noEmit
step "Markdown lint"         markdownlint-cli2
step "Workflow lint"         actionlint
step "Web astro check"    pnpm --dir web check
step "Web build"             pnpm --dir web build

smoke() {
  local started=0
  if ! aspire ps --non-interactive --nologo 2>/dev/null | grep -q apphost.mts; then
    aspire start --non-interactive --nologo >/dev/null || return 1
    started=1
  fi
  local rc=0
  aspire wait web --non-interactive --nologo >/dev/null &&
    curl -fsS --max-time 10 http://localhost:4321/api/auth/ok | grep -q '"ok":true' || rc=1
  [ "$started" = 1 ] && aspire stop --non-interactive --nologo >/dev/null
  return $rc
}
if [ "${1:-}" != "--no-stack" ]; then
  step "Aspire smoke test"   smoke
fi

printf '\n'
printf '%s\n' "${results[@]}"
exit $failed
