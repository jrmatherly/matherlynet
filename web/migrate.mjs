// Applies ./drizzle migrations before the server starts (dev and production).
// drizzle-orm 0.45's pg migrator takes no lock, so concurrent replicas would race;
// a session-level advisory lock serializes them.
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

const MIGRATION_LOCK_ID = 727001;

const pool = new pg.Pool({ connectionString: process.env.APPDB_URI, max: 2 });

// Compose's depends_on only waits for the Postgres container to start, not to accept connections.
async function connectWithRetry(attempts = 30) {
  for (let i = 1; ; i++) {
    try {
      return await pool.connect();
    } catch (err) {
      if (i >= attempts) throw err;
      console.log(`migrate: database not ready (${err.code ?? err.message}), retry ${i}/${attempts}`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

const lock = await connectWithRetry();
try {
  await lock.query("select pg_advisory_lock($1)", [MIGRATION_LOCK_ID]);
  await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
} finally {
  await lock.query("select pg_advisory_unlock($1)", [MIGRATION_LOCK_ID]).catch(() => {});
  lock.release();
  await pool.end();
}
