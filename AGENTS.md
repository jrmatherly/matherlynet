# matherlynet: agent guide

Astro 7 SSR app (`web/`) with better-auth on Drizzle/PostgreSQL, orchestrated by an Aspire 13.6
TypeScript AppHost (`apphost.mts`). Images build in CI and go to `ghcr.io/jrmatherly/matherlynet`.

## Commands

| Task | Command |
| :--- | :--- |
| Start the stack (Postgres + web) | `aspire start` (background) or `aspire run`; app at <http://localhost:4321> |
| Inspect / logs / stop | `aspire describe`, `aspire logs web`, `aspire wait web`, `aspire stop` |
| Lint and type-check the AppHost | `npm run lint` and `npx tsc -p tsconfig.apphost.json --noEmit` |
| Lint Markdown | `markdownlint-cli2` (or `pre-commit run --all-files`) |
| Build the web app | `cd web && pnpm build` |
| Smoke test (stack running) | `curl -s http://localhost:4321/api/auth/ok` returns `{"ok":true}` |
| New auth schema / migration | `cd web && APPDB_URI=postgresql://unused pnpm db:generate` |
| Deployment artifacts | `aspire publish -o out/compose`; `DEPLOY_TARGET=k8s aspire publish -o out/k8s` |

## Rules

- Run the app only through Aspire. Never run `astro dev` or `pnpm dev` directly: they start without
  the database, secrets, or the fixed port 4321 that auth callbacks depend on.
- `apphost.mts` is the source of truth for infrastructure. Dockerfiles, Compose files and Helm charts
  are generated into `out/` (gitignored); never hand-edit or commit them.
- Never edit `.aspire/` (generated TypeScript SDK). Regenerate with `aspire restore`; add integrations
  with `aspire add <name>`. Its `aspire.mts` is the authority for AppHost API signatures; aspire.dev
  snippets can lag (13.6: `withHelm({ configure })`, `withEndpointCallback` instead of
  `withHttpEndpoint` on `addViteApp`).
- Database: never edit migrations in `web/drizzle/` by hand. Change the better-auth config or
  `web/src/db/`, then run `pnpm db:generate` and commit the new SQL. `web/migrate.mjs` applies
  migrations on every start under a Postgres advisory lock.
- Dependencies: exact versions, latest stable. npm (`~/.npmrc`) and pnpm both enforce a minimum release
  age: pin a newer version explicitly (pnpm records `minimumReleaseAgeExclude`; npm needs
  `--min-release-age-exclude=<package-name>`). Known caps: `vscode-jsonrpc` 8.x (Aspire's generated
  transport imports `vscode-jsonrpc/node.js`), TypeScript 6.0.x (typescript-eslint peer range).
- pnpm 12 blocks dependency build scripts: approve with `pnpm approve-builds <pkg>`.
- Secrets come from Aspire parameters (`aspire secret set Parameters:<name> <value>`), never from
  committed files. OAuth providers stay disabled until both their id and secret are set.
- GitHub Actions: pin actions to full commit SHAs with a `# vX.Y.Z` comment, keep the concurrency
  group, emoji step names, and run `actionlint`.
- Markdown follows `.markdownlint-cli2.jsonc` (120 columns); the pre-commit hook enforces it.
- Don't push, publish images, or deploy without explicit approval.
