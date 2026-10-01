import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as authSchema from "./auth-schema";
import * as appSchema from "./schema";

// APPDB_URI is injected by Aspire from the `appdb` Postgres resource.
const pool = new pg.Pool({ connectionString: process.env.APPDB_URI });

// When Postgres drops an idle pooled connection (restart, failover), the pool emits "error"; with no listener
// Node exits the process. The pool discards that client and the next query connects afresh.
pool.on("error", (err) => console.error("db: idle connection lost", err.message));

export const db = drizzle({ client: pool, schema: { ...authSchema, ...appSchema } });
