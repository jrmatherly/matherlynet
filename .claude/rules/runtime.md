---
paths:
  - "web/start.mjs"
  - "web/server.mjs"
  - "web/otel.mjs"
  - "web/migrate.mjs"
  - "web/astro.config.mjs"
  - "web/src/db/**"
  - "web/src/lib/auth.ts"
  - "web/e2e/**"
  - "scripts/smoke-image.sh"
---

# Runtime, startup and auth

- Migrations run inside the web container on start: Aspire's Kubernetes publisher can't emit Jobs, and a separate
  run-once resource broke publishing.
- Astro sessions are disabled (`session: false` in `web/astro.config.mjs`, Astro 7.2+): the Node adapter's default
  filesystem session driver would diverge across replicas, and better-auth already keeps sessions in Postgres.
- The dev web endpoint is pinned to port 4321 so OAuth callback URLs stay stable.
- `web/e2e/global-setup.ts` opens Vite's HMR socket from Node and takes the `full-reload` Vite keeps for the first
  client (checked on vite 8.3.4): Astro sends it (checked on astro 7.4.2) when a dev start rewrites its content
  store (every `aspire start`: `astro dev` gets a new port behind the 4321 proxy, and that port is in the store's
  config digest). A first test's browser would otherwise take it mid-test and reload the page.
- `web/src/db/index.ts` builds its `pg.Pool`s itself and keeps a `pool.on("error")` listener on each: without it, a
  Postgres restart or failover drops idle connections and the unhandled `error` event kills the web process. Each
  pool also puts an `error` listener on every client it connects: pg-pool removes its own from a client taken with
  `pool.connect()`, and a socket that drops then would be an uncaught exception. It also
  sets connect (5 s), statement (10 s) and query (15 s) timeouts: node-postgres has none, and a stopped Postgres behind
  a proxy that accepts TCP (Aspire's, locally) hung every request. The live playground queries on its own pool of 6
  connections (`playgroundDb`), one per call a process admits. A call that stops waiting for a query leaves the query
  holding its connection, so on the pool auth uses a flood of calls could take the connections sign-in needs.
  It also wraps Drizzle's internal `queryWithCache`, which is where `DrizzleQueryError` is made, to remove a failed
  query's parameters (session and reset tokens, emails) from its message, stack and `params`, and the column values
  Postgres puts on its `cause` (`detail`, `where`, `hint`, `internalQuery`; code and message stay): otherwise every log
  line, Sentry event and span that sees the error repeats them. `sentry-wiring.test.ts` fails if a Drizzle bump moves
  it.
- `security.allowedDomains` (`matherly.net`, https) in `web/astro.config.mjs` makes Astro trust `X-Forwarded-Proto`
  behind Cloudflare; without it form POSTs fail the origin check with 403. Don't use `Astro.clientAddress`: a client
  can spoof it through `X-Forwarded-Host`/`X-Forwarded-For`.
- The image runs `node start.mjs` as the `node` user (`publishAsNodeServer`; `publishAsPackageScript`'s
  `pnpm run start` fails as non-root: pnpm 12 tries to reinstall into the root-owned `node_modules`). `start.mjs`
  dynamically imports `otel.mjs`, `migrate.mjs`, then `server.mjs` in one process: static imports would load
  `migrate.mjs`'s pg and drizzle before OpenTelemetry's hook registers, and one process means SIGTERM reaches
  `server.mjs`. Node is PID 1, which drops a signal it has no handler for, so until `server.mjs` has loaded,
  `start.mjs`'s own handlers exit on SIGTERM (143) and SIGINT (130). Before any import, `start.mjs` exits 1 on an
  `SMTP_URL` that is not an `smtp://` or `smtps://` URL or does not parse: nodemailer would throw on every request
  (`tests/start.test.ts`). `migrate.mjs` fails at once on a missing `APPDB_URI`, a login or unknown-database error
  or an unparseable URI, and retries anything else for 60 s.
  `server.mjs` sets `ASTRO_NODE_AUTOSTART=disabled`, calls `startServer()`, and on SIGTERM/SIGINT drains 7 s,
  flushes Sentry 1 s and OpenTelemetry 1.5 s, then exits 0, inside Docker's 10 s stop timeout. `otel.mjs` builds
  `NodeSDK` itself because `register.mjs`'s SIGTERM listener never exits. `scripts/smoke-image.sh` (CI: `e2e.yml`)
  builds the image and runs this entry as UID 1000 on a read-only root filesystem: migrations, serving, the fast
  failures, and a stop before and after the server is up.
- `session.freshAge` is 0 in `web/src/lib/auth.ts`: better-auth gates `listSessions` (the /account page) on a
  session created within `freshAge` (default one day; checked on better-auth 1.7.12), so a visitor signed in longer
  got a 500 there. The E2E suite ages a session row through `APPDB_URI` to keep the page open (`account.spec.ts`).
- Admins: the verified account whose email matches the `admin-email` parameter is promoted on verify.
  Keep `requireEmailVerification` on; without it anyone could register that email. Promotion happens only when
  the email becomes verified (not on every update, so demotions stick): set `admin-email` before that account's
  email is verified. Promotion failures are logged with the SQL to finish them; `/api/auth/*` errors go to Sentry
  through better-auth's `onAPIError` and an after-hook, not the Astro middleware.
