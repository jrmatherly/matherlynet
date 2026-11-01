# matherlynet (Claude Code)

@AGENTS.md

## Claude Code specifics

- Code navigation: see `.claude/rules/code-navigation.md` (CodeGraph first; Serena only for `.ts`/`.mts`/`.mjs`).
- Area rules load by path from `.claude/rules/` (AppHost, database, integrations, runtime, web, workflows).
- `/verify` runs the full local check (AppHost lint and tsc, Markdown and workflow lint, web check, lint, tests and
  build, then the Aspire smoke test and Playwright E2E; `--no-stack` skips the last two).
  `/bump-deps` is the dependency-update procedure; `/ship` pushes and watches CI (only when asked to push); `/release`
  cuts a signed tag and GitHub Release (only when asked).
- A PostToolUse hook lints each edited file; fix what it reports before moving on. Order a multi-file change
  definition-first (the file that declares a prop or export, then its users): a report the next edit in the same
  batch resolves gets one set-wide `eslint` + `astro check` at the end, not a fix per file.
- With the stack running, read live state through the Aspire MCP server (`.mcp.json`): `mcp__aspire__list_resources`,
  `list_console_logs`, `list_structured_logs`, `list_traces`. `execute_resource_command` (start/stop/restart) asks
  first.
- Local HTTPS: if the Aspire dashboard shows certificate errors, ask the user to run `aspire certs trust`
  (it needs an interactive macOS prompt that this session can't show).
