import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as authSchema from "./auth-schema";
import * as appSchema from "./schema";

// APPDB_URI is injected by Aspire from the `appdb` Postgres resource.
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
  // A client checked out by hand (pool.connect()) has no "error" listener: pg-pool 3.14.0 takes its own off at checkout,
  // and pg 8.23.1 emits "error" when the socket drops, which unheard is an uncaught exception that ends the process.
  // This one stays on every client; the failed query's rejection already carries the error.
  pool.on("connect", (client) => client.on("error", () => {}));
  return pool;
}

export const db = drizzle({ client: newPool(), schema: { ...authSchema, ...appSchema } });

// The live playground's own connections. A call gives up on a query it no longer waits for (the deadline, a visitor
// leaving) while the query still holds its connection, so on the shared pool a flood of calls during a slow database
// would take the connections that sign-in needs. 6: one per call a process admits (IN_FLIGHT_MAX in
// lib/playground-io.ts; a test pins the two together). A pool opens no connection until its first query.
export const playgroundDb = drizzle({ client: newPool(6) });
