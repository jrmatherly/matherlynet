import { DrizzleQueryError } from "drizzle-orm/errors";
import { drizzle } from "drizzle-orm/node-postgres";
import { PgPreparedQuery } from "drizzle-orm/pg-core";
import pg from "pg";
import * as authSchema from "./auth-schema";
import * as appSchema from "./schema";

// A failed query's DrizzleQueryError quotes its parameters (session and reset tokens, emails) in its message, stack and
// `params`, so every log line, Sentry event and span that sees the error would repeat them. Drizzle has no option for
// this and makes the error in an internal method (pg-core/session.js, checked on drizzle-orm 0.45.4), so they are
// removed there. sentry-wiring.test.ts runs a real failing query and fails if that method moves.
const prepared = PgPreparedQuery.prototype as unknown as { queryWithCache(...args: unknown[]): Promise<unknown> };
const queryWithCache = prepared.queryWithCache;
prepared.queryWithCache = function (...args) {
  return queryWithCache.apply(this, args).catch((error: unknown) => {
    if (error instanceof DrizzleQueryError) {
      const message = `Failed query: ${error.query}`;
      error.stack = error.stack?.replace(error.message, () => message);
      error.message = message;
      error.params = [];
      // Postgres puts column values here ("Key (email)=(…) already exists"); its code and message stay for debugging.
      const cause = error.cause as unknown as Record<string, unknown> | undefined;
      for (const field of ["detail", "where", "hint", "internalQuery"]) delete cause?.[field];
    }
    throw error;
  });
};

// APPDB_URI is injected by Aspire: from the `appdb` Postgres resource, or under Kubernetes the `appdb-uri` parameter.
// node-postgres has no connect or query timeout by default: an unreachable (or proxied, half-open) database hangs
// requests forever. Values are this project's choice; node-postgres documents no recommendation.
function newPool(max?: number) {
  const pool = new pg.Pool({
    connectionString: process.env.APPDB_URI,
    max, // undefined: pg-pool's default, 10
    connectionTimeoutMillis: 5_000, // fail fast instead of hanging requests when Postgres is unreachable
    statement_timeout: 10_000, // server cancels runaway statements
    query_timeout: 15_000, // client-side backstop for a dead socket (> statement_timeout)
  });
  // When Postgres drops an idle pooled connection (restart, failover), the pool emits "error"; with no listener
  // Node exits the process. The pool discards that client and the next query connects afresh.
  // The code (e.g. 57P01 admin shutdown, ECONNRESET) tells a restart or failover from an auth or TLS problem.
  pool.on("error", (err: Error & { code?: string }) => console.error("db: idle connection lost", err.code ?? "", err.message));
  // A client checked out by hand (pool.connect()) has no "error" listener: pg-pool takes its own off at checkout, and
  // pg emits "error" when the socket drops, which unheard is an uncaught exception that ends the process
  // (checked on pg-pool 3.14.0 and pg 8.23.1).
  // This one stays on every client. It logs only the code (else the name): the next query may report just "not
  // queryable", and a message can quote SQL parameters.
  pool.on("connect", (client) =>
    client.on("error", (err: Error & { code?: unknown }) => console.error("db: checked-out connection lost", typeof err.code === "string" ? err.code : err.name)),
  );
  return pool;
}

export const db = drizzle({ client: newPool(), schema: { ...authSchema, ...appSchema } });

// The live playground's own connections. A call gives up on a query it no longer waits for (the deadline, a visitor
// leaving) while the query still holds its connection, so on the shared pool a flood of calls during a slow database
// would take the connections that sign-in needs. 6: one per call a process admits (IN_FLIGHT_MAX in
// lib/playground-io.ts; a test pins the two together). A pool opens no connection until its first query.
export const playgroundDb = drizzle({ client: newPool(6) });
