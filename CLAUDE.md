# matherlynet (Claude Code)

@AGENTS.md

## Claude Code specifics

- Code navigation: see `.claude/rules/code-navigation.md` (CodeGraph first; Serena only for `.ts`/`.mts`/`.mjs`).
- Area rules load on demand from `.claude/rules/` (AppHost, database, workflows).
- `/verify` runs the full local check (lint, type-check, Markdown, stack smoke test).
  `/bump-deps` is the dependency-update procedure.
- A PostToolUse hook lints each edited file; fix what it reports before moving on. Order a multi-file change
  definition-first (the file that declares a prop or export, then its users): a report the next edit in the same
  batch resolves gets one set-wide `eslint` + `astro check` at the end, not a fix per file.
- With the stack running, read live state through the Aspire MCP server (`.mcp.json`): `mcp__aspire__list_resources`,
  `list_console_logs`, `list_structured_logs`, `list_traces`. `execute_resource_command` (start/stop/restart) asks first.
- Local HTTPS: if the Aspire dashboard shows certificate errors, ask the user to run `aspire certs trust`
  (it needs an interactive macOS prompt that this session can't show).
