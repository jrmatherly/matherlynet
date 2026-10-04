// Applies ./drizzle migrations before the server starts (dev and production).
// drizzle-orm 0.45's pg migrator takes no lock, so concurrent replicas would race;
// a session-level advisory lock serializes them.
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

const MIGRATION_LOCK_ID = 727001;
const WAIT_MS = 60_000;

// pg 8 treats an empty connection string as none and connects to localhost:5432, which would read as a database
// that is not up yet.
if (!process.env.APPDB_URI) {
  console.error(
    "migrate: APPDB_URI is not set. Under Kubernetes it is the Helm value secrets.web.appdb_uri; " +
      "Compose and `aspire run` set it from the Postgres resource.",
  );
  process.exit(1);
}

// Without a connect timeout a host that drops packets holds each attempt for minutes (the OS's TCP timeout), and one
// that accepts TCP but never answers holds it forever.
const pool = new pg.Pool({ connectionString: process.env.APPDB_URI, max: 2, connectionTimeoutMillis: 5_000 });

// Waiting cannot fix these: SQLSTATE class 28 (bad login) and 3D (no such database), and a URI that does not parse.
// Retrying a bad password would also be a failed login every 2 s against a shared server.
const permanent = (err) => /^(28|3D)/.test(err.code ?? "") || err.code === "ERR_INVALID_URL";

// Compose's depends_on only waits for the Postgres container to start, not to accept connections.
async function connectWithRetry() {
  const deadline = Date.now() + WAIT_MS;
  for (let i = 1; ; i++) {
    try {
      return await pool.connect();
    } catch (err) {
      if (permanent(err) || Date.now() >= deadline) throw err;
      console.log(`migrate: database not ready (${err.code ?? err.message}), attempt ${i}, retrying for up to 60 s`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

const lock = await connectWithRetry();
try {
  const [{ ok }] = (await lock.query("select pg_try_advisory_lock($1) as ok", [MIGRATION_LOCK_ID])).rows;
  if (!ok) {
    console.log("migrate: another instance is migrating; waiting for it to finish");
    await lock.query("select pg_advisory_lock($1)", [MIGRATION_LOCK_ID]);
  }
  await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
} finally {
  await lock.query("select pg_advisory_unlock($1)", [MIGRATION_LOCK_ID]).catch(() => {});
  lock.release();
  await pool.end();
}
