import { db } from "../db";
import { siteSettings } from "../db/schema";
import { SITE_DEFAULTS, isProPalette } from "../theme/palettes";
import { configureSentry } from "./sentry";
import type { SiteSettings } from "./settings-form";

// ponytail: per-process cache, so other replicas see an admin change within TTL_MS; add pub/sub if that lag matters.
const TTL_MS = 30_000;
let cached: { value: SiteSettings; expires: number } | null = null;

async function remember(value: SiteSettings): Promise<SiteSettings> {
  cached = { value, expires: Date.now() + TTL_MS };
  // Server-side Sentry follows the settings live: the DSN and on/off switch apply to the next event.
  configureSentry(value.sentry.server ? value.sentry.dsn : null);
  return value;
}

// Stored values are re-validated: a palette removed from the code falls back to the built-in default.
// With no row (or no database), this is the built-in default settings.
function fromRow(row: typeof siteSettings.$inferSelect | undefined): SiteSettings {
  return {
    theme: row?.theme === "pro" ? "pro" : row?.theme === "brand" ? "brand" : SITE_DEFAULTS.theme,
    proPalette: isProPalette(row?.proPalette) ? row.proPalette : SITE_DEFAULTS.proPalette,
    sentry: { dsn: row?.sentryDsn ?? null, server: row?.sentryServer ?? false, browser: row?.sentryBrowser ?? false },
    umami: {
      enabled: row?.umamiEnabled ?? false,
      scriptUrl: row?.umamiScriptUrl ?? null,
      websiteId: row?.umamiWebsiteId ?? null,
    },
  };
}

// Bumped by every save: a refresh whose SELECT started before a save must not overwrite what was saved.
let generation = 0;

async function load(): Promise<SiteSettings> {
  const started = generation;
  try {
    const [row] = await db.select().from(siteSettings).limit(1);
    if (generation !== started) return cached!.value;
    return await remember(fromRow(row));
  } catch (error) {
    // Usually the database is unreachable (anything else lands here too, so the message says "load failed"):
    // keep pages up with the last settings (or built-in defaults) and retry in 5 s instead of on every request.
    console.error("site-settings: load failed, serving last known settings", error);
    const fallback = cached?.value ?? fromRow(undefined);
    cached = { value: fallback, expires: Date.now() + 5_000 };
    return fallback;
  }
}

let refreshing: Promise<SiteSettings> | null = null;

export async function getSiteSettings(): Promise<SiteSettings> {
  if (cached && cached.expires > Date.now()) return cached.value;
  // One refresh at a time. With a cached value, requests don't wait for it: a slow or unreachable database (up
  // to the pool's 5 s connect or 15 s query timeout) would otherwise stall a request, or a probe, on every refresh.
  refreshing ??= load().finally(() => {
    refreshing = null;
  });
  return cached ? cached.value : refreshing;
}

export async function saveSiteSettings(value: SiteSettings): Promise<void> {
  const row = {
    theme: value.theme,
    proPalette: value.proPalette,
    sentryDsn: value.sentry.dsn,
    sentryServer: value.sentry.server,
    sentryBrowser: value.sentry.browser,
    umamiEnabled: value.umami.enabled,
    umamiScriptUrl: value.umami.scriptUrl,
    umamiWebsiteId: value.umami.websiteId,
    updatedAt: new Date(),
  };
  await db.insert(siteSettings).values({ id: 1, ...row }).onConflictDoUpdate({ target: siteSettings.id, set: row });
  generation++;
  await remember(value);
}
