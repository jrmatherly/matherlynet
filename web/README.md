# matherlynet-web

Astro 7 SSR app (`@astrojs/node` standalone) with better-auth on Drizzle/PostgreSQL.
Run it through Aspire from the repository root; see the [root README](../README.md). The file-by-file map is
[.claude/rules/web-architecture.md](../.claude/rules/web-architecture.md).

| Path                       | Purpose                                                              |
| :------------------------- | :------------------------------------------------------------------- |
| `src/lib/auth.ts`          | better-auth server config (email/password, OAuth)                    |
| `src/pages/api/auth/`      | better-auth request handler                                          |
| `src/middleware.ts`        | Session, settings and theme into `Astro.locals`; security headers    |
| `src/db/`                  | Drizzle clients, generated auth schema, app tables in `schema.ts`    |
| `drizzle/`                 | SQL migrations, applied by `migrate.mjs` on start                    |
| `public/`                  | Favicons, web manifest, logo, portraits                              |

| Command            | Action                                                                  |
| :----------------- | :---------------------------------------------------------------------- |
| `pnpm check`       | `astro check` (types and Astro diagnostics)                             |
| `pnpm lint`        | ESLint                                                                  |
| `pnpm test`        | Vitest unit and component tests                                         |
| `pnpm build`       | Build the production server to `./dist/`                                |
| `pnpm e2e`         | Playwright against the running Aspire stack                             |
| `pnpm start`       | Run the built server through `start.mjs` (OpenTelemetry, migrations)    |
| `pnpm db:generate` | Regenerate the auth schema and a new SQL migration                      |
