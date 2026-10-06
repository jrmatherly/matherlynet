// The specs that write to the app database (account.spec.ts ages a session row, live.spec.ts seeds and deletes
// playground_call rows) take APPDB_URI from global-setup.ts or the environment, and only when it names a local
// database.
const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

// pg takes a ?host= parameter over the URL's host, so a loopback hostname alone proves nothing.
export function localAppDb(): string {
  const uri = process.env.APPDB_URI ?? "";
  const appdb = URL.parse(uri);
  if (!LOOPBACK.has(appdb?.hostname ?? "") || appdb?.searchParams.has("host")) {
    throw new Error("The E2E suite writes to the app database: set APPDB_URI to a database on localhost, 127.0.0.1 or ::1, with no host parameter.");
  }
  return uri;
}
