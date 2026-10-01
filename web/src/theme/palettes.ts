// Palette keys and display names. Colors live in src/styles/palettes.css; tests/theme.test.ts
// fails if the two drift apart.

export const BRAND_PALETTE = "signal";

export const PRO_PALETTES = {
  amber: "Carbon & Amber",
  indigo: "Indigo Circuit",
  cobalt: "Cobalt",
  mono: "Monochrome",
  flare: "Titanium & Flare",
  merlot: "Merlot",
  ember: "Ember Slate",
  champagne: "Champagne",
  evergreen: "Evergreen",
  navy: "Navy & Brass",
  oxide: "Oxide",
} as const;

export type ProPalette = keyof typeof PRO_PALETTES;
export type Theme = "brand" | "pro";
export type Mode = "light" | "dark" | "system";

export interface SiteThemeDefaults {
  theme: Theme;
  proPalette: ProPalette;
}

// ponytail: constants until the admin settings table lands (step 5); then read from Postgres.
export const SITE_DEFAULTS: SiteThemeDefaults = { theme: "brand", proPalette: "amber" };

export const THEME_COOKIE = "mn-theme";
export const MODE_COOKIE = "mn-mode";

export interface ResolvedTheme {
  theme: Theme;
  mode: Mode;
  palette: typeof BRAND_PALETTE | ProPalette;
}

export const isProPalette = (value: unknown): value is ProPalette =>
  typeof value === "string" && Object.hasOwn(PRO_PALETTES, value);

// Cookies are visitor input: anything unrecognised falls back to the site defaults.
export function resolveTheme(
  cookies: { theme?: string; mode?: string },
  site: SiteThemeDefaults = SITE_DEFAULTS,
): ResolvedTheme {
  const theme: Theme = cookies.theme === "brand" || cookies.theme === "pro" ? cookies.theme : site.theme;
  const mode: Mode = cookies.mode === "light" || cookies.mode === "dark" ? cookies.mode : "system";
  const palette = theme === "brand" ? BRAND_PALETTE : isProPalette(site.proPalette) ? site.proPalette : SITE_DEFAULTS.proPalette;
  return { theme, mode, palette };
}
