# matherlynet-web

Astro 7 SSR app (`@astrojs/node` standalone) with better-auth on Drizzle/PostgreSQL.
Run it through Aspire from the repository root; see the [root README](../README.md).

| Path                       | Purpose                                               |
| :------------------------- | :---------------------------------------------------- |
| `src/lib/auth.ts`          | better-auth server config (email/password, OAuth)     |
| `src/pages/api/auth/`      | better-auth request handler                           |
| `src/middleware.ts`        | Loads the session into `Astro.locals`                 |
| `src/db/`                  | Drizzle client and generated auth schema              |
| `drizzle/`                 | SQL migrations, applied by `migrate.mjs` on start     |
| `public/`                  | Favicons, web manifest, logo                          |

| Command            | Action                                                        |
| :----------------- | :------------------------------------------------------------ |
| `pnpm build`       | Build the production server to `./dist/`                      |
| `pnpm db:generate` | Regenerate the auth schema and a new SQL migration            |
