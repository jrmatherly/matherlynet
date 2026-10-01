# Which code tool to use here

- **Understand / locate** (what calls what, where is X): CodeGraph first (`codegraph_explore`).
- **Read or edit a symbol in `*.ts` / `*.mts` / `*.mjs`** (`apphost.mts`, `web/src/**/*.ts`, `web/*.mjs`):
  Serena's symbol tools (`get_symbols_overview`, `find_symbol`, `replace_symbol_body`, `find_referencing_symbols`).
- **Everything else**: native Read/Edit/Grep/Glob. That covers `.astro` files (the TypeScript language
  server doesn't parse them), Markdown, JSON/YAML, SQL migrations and workflows.
  Serena's "Edit is forbidden for code files" applies only to files its language server serves.
- Never search or read inside `.aspire/modules/` to learn the AppHost API wholesale: it is a ~117k-line
  generated file. Grep it for the one signature you need (e.g. `grep -n "withHelm(" .aspire/modules/aspire.mts`).
