import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Finds Mailpit's HTTP endpoint from the running AppHost unless MAILPIT_URL is set.
// Workers inherit process.env, so the tests read it from there.
export default function globalSetup() {
  if (process.env.MAILPIT_URL) return;
  const apphost = fileURLToPath(new URL("../../apphost.mts", import.meta.url));
  const out = execFileSync("aspire", ["describe", "--apphost", apphost, "--format", "json", "--nologo", "--non-interactive"], {
    encoding: "utf8",
  });
  const { resources } = JSON.parse(out) as { resources: { name: string; urls?: { name: string; url: string }[] }[] };
  const url = resources.find((r) => r.name.startsWith("mailpit"))?.urls?.find((u) => u.name === "http")?.url;
  if (!url) throw new Error("Mailpit not found: start the stack with `aspire start`, or set MAILPIT_URL.");
  process.env.MAILPIT_URL = url;
}
