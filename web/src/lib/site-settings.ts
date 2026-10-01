import { db } from "../db";
import { siteSettings } from "../db/schema";
import { SITE_DEFAULTS, isProPalette, type SiteThemeDefaults } from "../theme/palettes";

// ponytail: per-process cache, so other replicas see an admin change within TTL_MS; add pub/sub if that lag matters.
const TTL_MS = 30_000;
let cached: { value: SiteThemeDefaults; expires: number } | null = null;

export async function getSiteDefaults(): Promise<SiteThemeDefaults> {
  if (cached && cached.expires > Date.now()) return cached.value;
  const [row] = await db.select().from(siteSettings).limit(1);
  // Stored values are re-validated: a palette removed from the code falls back to the built-in default.
  const value: SiteThemeDefaults = {
    theme: row?.theme === "pro" ? "pro" : row?.theme === "brand" ? "brand" : SITE_DEFAULTS.theme,
    proPalette: isProPalette(row?.proPalette) ? row.proPalette : SITE_DEFAULTS.proPalette,
  };
  cached = { value, expires: Date.now() + TTL_MS };
  return value;
}

export async function saveSiteDefaults(value: SiteThemeDefaults): Promise<void> {
  const row = { theme: value.theme, proPalette: value.proPalette, updatedAt: new Date() };
  await db.insert(siteSettings).values({ id: 1, ...row }).onConflictDoUpdate({ target: siteSettings.id, set: row });
  cached = { value, expires: Date.now() + TTL_MS };
}
