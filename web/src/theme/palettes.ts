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
  paper: "Paper & Evergreen",
} as const;

export type ProPalette = keyof typeof PRO_PALETTES;
export type Theme = "brand" | "pro";
export type Mode = "light" | "dark" | "system";

// Display face for headings. Body text stays Geist either way; see .display in global.css.
export const TYPEFACES = { sans: "Geist", serif: "Newsreader" } as const;
export type Typeface = keyof typeof TYPEFACES;

export interface SiteThemeDefaults {
  theme: Theme;
  proPalette: ProPalette;
  typeface: Typeface;
}

// Built-in fallback; the live defaults are set on /admin (src/lib/site-settings.ts).
export const SITE_DEFAULTS: SiteThemeDefaults = { theme: "brand", proPalette: "amber", typeface: "sans" };

export const THEME_COOKIE = "mn-theme";
export const MODE_COOKIE = "mn-mode";
export const TYPE_COOKIE = "mn-type";

export interface ResolvedTheme {
  theme: Theme;
  mode: Mode;
  palette: typeof BRAND_PALETTE | ProPalette;
  typeface: Typeface;
}

export const isProPalette = (value: unknown): value is ProPalette =>
  typeof value === "string" && Object.hasOwn(PRO_PALETTES, value);

export const isTypeface = (value: unknown): value is Typeface => typeof value === "string" && Object.hasOwn(TYPEFACES, value);

// Cookies are visitor input: anything unrecognised falls back to the site defaults (mode has none: "system").
export function resolveTheme(
  cookies: { theme?: string; mode?: string; type?: string },
  site: SiteThemeDefaults = SITE_DEFAULTS,
): ResolvedTheme {
  const theme: Theme = cookies.theme === "brand" || cookies.theme === "pro" ? cookies.theme : site.theme;
  const mode: Mode = cookies.mode === "light" || cookies.mode === "dark" ? cookies.mode : "system";
  const palette = theme === "brand" ? BRAND_PALETTE : isProPalette(site.proPalette) ? site.proPalette : SITE_DEFAULTS.proPalette;
  const typeface: Typeface = isTypeface(cookies.type) ? cookies.type : isTypeface(site.typeface) ? site.typeface : SITE_DEFAULTS.typeface;
  return { theme, mode, palette, typeface };
}
