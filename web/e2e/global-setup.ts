import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Finds Mailpit's HTTP endpoint and the app database's connection string from the running AppHost, unless MAILPIT_URL
// is set: then the run targets another stack, and live.spec.ts needs APPDB_URI set too. An APPDB_URI already set wins.
// Workers inherit process.env, so the tests read them from there.
export default function globalSetup() {
  if (process.env.MAILPIT_URL) return;
  const apphost = fileURLToPath(new URL("../../apphost.mts", import.meta.url));
  const out = execFileSync("aspire", ["describe", "--apphost", apphost, "--format", "json", "--nologo", "--non-interactive"], {
    encoding: "utf8",
  });
  const { resources } = JSON.parse(out) as {
    resources: { name: string; urls?: { name: string; url: string }[]; environment?: Record<string, string> }[];
  };
  const url = resources.find((r) => r.name.startsWith("mailpit"))?.urls?.find((u) => u.name === "http")?.url;
  if (!url) throw new Error("Mailpit not found: start the stack with `aspire start`, or set MAILPIT_URL.");
  process.env.MAILPIT_URL = url;
  // Only live.spec.ts reads it, and only with the model on, so a stack without one fails there, not here.
  // process.env stores undefined as the string "undefined", so a stack without one leaves it unset.
  const appdb = resources.find((r) => r.environment?.APPDB_URI)?.environment?.APPDB_URI;
  if (appdb) process.env.APPDB_URI ??= appdb;
}
