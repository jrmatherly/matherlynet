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

export async function getSiteSettings(): Promise<SiteSettings> {
  if (cached && cached.expires > Date.now()) return cached.value;
  const [row] = await db.select().from(siteSettings).limit(1);
  // Stored values are re-validated: a palette removed from the code falls back to the built-in default.
  return remember({
    theme: row?.theme === "pro" ? "pro" : row?.theme === "brand" ? "brand" : SITE_DEFAULTS.theme,
    proPalette: isProPalette(row?.proPalette) ? row.proPalette : SITE_DEFAULTS.proPalette,
    sentry: { dsn: row?.sentryDsn ?? null, server: row?.sentryServer ?? false, browser: row?.sentryBrowser ?? false },
    umami: {
      enabled: row?.umamiEnabled ?? false,
      scriptUrl: row?.umamiScriptUrl ?? null,
      websiteId: row?.umamiWebsiteId ?? null,
    },
  });
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
  await remember(value);
}
