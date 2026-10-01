# matherlynet (Claude Code)

@AGENTS.md

## Claude Code specifics

- Code navigation: see `.claude/rules/code-navigation.md` (CodeGraph first; Serena only for `.ts`/`.mts`/`.mjs`).
- Area rules load on demand from `.claude/rules/` (AppHost, database, workflows).
- `/verify` runs the full local check (lint, type-check, Markdown, stack smoke test).
  `/bump-deps` is the dependency-update procedure.
- A PostToolUse hook lints each edited file; fix what it reports before moving on.
- Local HTTPS: if the Aspire dashboard shows certificate errors, ask the user to run `aspire certs trust`
  (it needs an interactive macOS prompt that this session can't show).
