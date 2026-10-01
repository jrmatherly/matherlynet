import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as authSchema from "./auth-schema";
import * as appSchema from "./schema";

// APPDB_URI is injected by Aspire from the `appdb` Postgres resource.
// node-postgres has no connect or query timeout by default: an unreachable (or proxied, half-open) database hangs
// requests forever. Values are this project's choice; node-postgres documents no recommendation.
const pool = new pg.Pool({
  connectionString: process.env.APPDB_URI,
  connectionTimeoutMillis: 5_000, // fail fast instead of hanging requests when Postgres is unreachable
  statement_timeout: 10_000, // server cancels runaway statements
  query_timeout: 15_000, // client-side backstop for a dead socket (> statement_timeout)
});

// When Postgres drops an idle pooled connection (restart, failover), the pool emits "error"; with no listener
// Node exits the process. The pool discards that client and the next query connects afresh.
// The code (e.g. 57P01 admin shutdown, ECONNRESET) tells a restart or failover from an auth or TLS problem.
pool.on("error", (err: Error & { code?: string }) => console.error("db: idle connection lost", err.code ?? "", err.message));

export const db = drizzle({ client: pool, schema: { ...authSchema, ...appSchema } });
