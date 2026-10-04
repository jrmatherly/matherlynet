import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { FullConfig } from "@playwright/test";

// Vite (8.3.1) keeps a full-reload sent while no client is connected and hands it to the first socket that connects.
// Astro (7.3.5) sends one when a dev start rewrites its content store, which every `aspire start` does: the dev
// server's port changes, and it is part of the store's config digest. The first page a test opened was reloaded
// about 250 ms in, sometimes under the form it was filling. This socket connects first and takes that reload; Vite
// asks a client that sends no Origin header for no token. A built app has no Vite client and is left alone, and an
// app that doesn't answer is reported by the Mailpit lookup or the first test.
async function takeBufferedReload(baseURL: string) {
  const html = await fetch(baseURL).then(
    (page) => page.text(),
    () => "",
  );
  if (!html.includes("/@vite/client")) return;
  const socket = new WebSocket(new URL(baseURL).origin.replace(/^http/, "ws"), "vite-hmr");
  // Vite sends the kept message right after "connected", so one frame means it is gone.
  await new Promise((resolve, reject) => {
    socket.onmessage = resolve;
    socket.onerror = socket.onclose = () => reject(new Error(`Vite's HMR socket at ${baseURL} closed before its first message.`));
  });
  socket.close();
}

// Finds Mailpit's HTTP endpoint and the app database's connection string from the running AppHost, unless MAILPIT_URL
// is set: then the run targets another stack, and live.spec.ts needs APPDB_URI set too. An APPDB_URI already set wins.
// Workers inherit process.env, so the tests read them from there.
export default async function globalSetup(config: FullConfig) {
  await takeBufferedReload(config.projects[0].use.baseURL!);
  if (process.env.MAILPIT_URL) return;
  const apphost = fileURLToPath(new URL("../../apphost.mts", import.meta.url));
  const out = execFileSync("aspire", ["describe", "--apphost", apphost, "--format", "json", "--nologo", "--non-interactive"], {
    encoding: "utf8",
  });
  // With no AppHost running, `aspire describe` (13.6) exits 0 and prints nothing to stdout.
  const { resources = [] } = JSON.parse(out || "{}") as {
    resources?: { name: string; urls?: { name: string; url: string }[]; environment?: Record<string, string> }[];
  };
  const url = resources.find((r) => r.name.startsWith("mailpit"))?.urls?.find((u) => u.name === "http")?.url;
  if (!url) throw new Error("Mailpit not found: start the stack with `aspire start`, or set MAILPIT_URL.");
  process.env.MAILPIT_URL = url;
  // Only live.spec.ts reads it, and only with the model on, so a stack without one fails there, not here.
  // process.env stores undefined as the string "undefined", so a stack without one leaves it unset.
  const appdb = resources.find((r) => r.environment?.APPDB_URI)?.environment?.APPDB_URI;
  if (appdb) process.env.APPDB_URI ??= appdb;
}
