import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { FullConfig } from "@playwright/test";

// Vite (8.3.1) keeps a full-reload sent while no client is connected and hands it to the first socket that connects.
// Astro (7.3.5) sends one when a dev start rewrites its content store, which every `aspire start` does: Aspire gives
// `astro dev` a new port behind its 4321 proxy, and that port is part of the store's config digest. Left in the
// buffer, the reload goes to the first page a test opens, sometimes under the form the test is filling. This socket
// connects first and takes it. Vite checks its connection token only when a request has an Origin header, and Node's
// WebSocket sends none. A built app has no Vite client and is left alone.
// Both waits have a limit: Playwright puts none on global setup, and Aspire's proxy accepts a connection to a
// stopped resource without answering it.
async function takeBufferedReload(baseURL: string) {
  const page = await fetch(baseURL, { signal: AbortSignal.timeout(15_000) }).catch((cause: unknown) => {
    throw new Error(`E2E: ${baseURL} did not answer. Start the stack with \`aspire start\`, or set E2E_BASE_URL.`, { cause });
  });
  if (!page.ok) throw new Error(`E2E: ${baseURL} answered ${page.status}.`);
  if (!(await page.text()).includes("/@vite/client")) return;
  const socket = new WebSocket(new URL(baseURL).origin.replace(/^http/, "ws"), "vite-hmr");
  let limit: NodeJS.Timeout | undefined;
  try {
    // Vite sends the kept message right after "connected", so one frame means it is gone.
    await new Promise((resolve, reject) => {
      socket.onmessage = resolve;
      socket.onerror = socket.onclose = () => reject(new Error(`Vite's HMR socket at ${baseURL} closed before its first message.`));
      limit = setTimeout(reject, 10_000, new Error(`Vite's HMR socket at ${baseURL} sent nothing within 10 s.`));
    });
  } finally {
    clearTimeout(limit);
    socket.close();
  }
}

// Finds Mailpit's HTTP endpoint and the app database's connection string from the running AppHost, unless MAILPIT_URL
// is set: then the run targets another stack, and account.spec.ts and live.spec.ts need APPDB_URI set too. An APPDB_URI
// already set wins.
// Workers inherit process.env, so the tests read them from there.
export default async function globalSetup(config: FullConfig) {
  await takeBufferedReload(config.projects[0].use.baseURL!);
  if (process.env.MAILPIT_URL) return;
  const apphost = fileURLToPath(new URL("../../apphost.mts", import.meta.url));
  const out = execFileSync("aspire", ["describe", "--apphost", apphost, "--format", "json", "--nologo", "--non-interactive"], {
    encoding: "utf8",
  });
  // With no AppHost running, `aspire describe` (13.6) exits 0 and prints nothing to stdout.
  const { resources } = JSON.parse(out || '{"resources":[]}') as {
    resources: { name: string; urls?: { name: string; url: string }[]; environment?: Record<string, string> }[];
  };
  const url = resources.find((r) => r.name.startsWith("mailpit"))?.urls?.find((u) => u.name === "http")?.url;
  if (!url) throw new Error("Mailpit not found: start the stack with `aspire start`, or set MAILPIT_URL.");
  process.env.MAILPIT_URL = url;
  // Only account.spec.ts and live.spec.ts (model on) read it, so a stack without one fails there, not here.
  // process.env stores undefined as the string "undefined", so a stack without one leaves it unset.
  const appdb = resources.find((r) => r.environment?.APPDB_URI)?.environment?.APPDB_URI;
  if (appdb) process.env.APPDB_URI ??= appdb;
}
