#!/bin/bash
#
# Claude Code PostToolUse hook (Edit|Write + Serena edit tools): lint the one file
# that was just edited. Problems go to stderr with exit 2, which Claude Code shows to
# Claude so it fixes them in the same turn (exit 1 would only reach the user).
# Anything unexpected exits 0: a broken hook must never block the session.
# Wired up in .claude/settings.json.
#
#   *.md                      markdownlint-cli2 (repo config, this file only)
#   apphost.mts               eslint + tsc -p tsconfig.apphost.json
#   web/**/*.{astro,ts,tsx,mjs}  eslint (this file) + astro check (whole web project); a case * crosses "/"
#   .github/workflows/*.y*ml  actionlint

set -uo pipefail

# CLAUDE_PROJECT_DIR stays on the main checkout after a session enters a worktree; the input's cwd follows it
{ read -r file; read -r cwd; } < <(jq -r '.tool_input.file_path // .tool_input.relative_path // "", .cwd // ""' 2>/dev/null)
[ -n "${file:-}" ] || exit 0
# Edit/Write send an absolute file_path; Serena's edit tools a relative_path
[[ $file == /* ]] || file="${cwd:-${CLAUDE_PROJECT_DIR:-$PWD}}/$file"

# Only existing files in this repository or a worktree of it (directories, e.g. from replace_in_files, are skipped)
[ -f "$file" ] || exit 0
common() { git -C "$1" rev-parse --path-format=absolute --git-common-dir 2>/dev/null; }
repo=$(common "$(dirname "$file")") || exit 0
[ "$repo" = "$(common "${CLAUDE_PROJECT_DIR:-$PWD}")" ] || exit 0

cd "$(dirname "$file")" || exit 0
rel="$(git rev-parse --show-prefix)$(basename "$file")"
cd "$(git rev-parse --show-toplevel)" || exit 0

# Generated or machine-local files (.aspire/, out/, private/, …) aren't ours to lint
git check-ignore -q -- "$rel" && exit 0

problems=""
run() {
  local out
  if ! out=$("$@" 2>&1); then
    problems+="\$ $*"$'\n'"$out"$'\n'
  fi
}

case $rel in
  *.md)
    # --no-globs: lint just this file, not the config's "**/*.md"
    command -v markdownlint-cli2 >/dev/null && run markdownlint-cli2 --no-globs "$rel"
    ;;
  apphost.mts)
    [ -x node_modules/.bin/eslint ] && run node_modules/.bin/eslint "$rel"
    [ -x node_modules/.bin/tsc ] && run node_modules/.bin/tsc -p tsconfig.apphost.json --noEmit
    ;;
  web/src/*.astro | web/src/*.ts | web/src/*.tsx | web/tests/*.ts | web/*.mjs | web/*.ts)
    [ -x web/node_modules/.bin/eslint ] && run pnpm --dir web exec eslint "${rel#web/}"
    [ -x web/node_modules/.bin/astro ] && run pnpm --dir web exec astro check --minimumSeverity warning
    ;;
  .github/workflows/*.yml | .github/workflows/*.yaml)
    command -v actionlint >/dev/null && run actionlint "$rel"
    ;;
esac

if [ -n "$problems" ]; then
  printf 'Lint problems in %s (fix before continuing):\n%s' "$rel" "$problems" >&2
  exit 2
fi
exit 0
