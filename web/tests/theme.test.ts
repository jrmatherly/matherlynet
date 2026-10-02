import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { colorsFromCss } from "../src/theme/palette-css";
import { BRAND_PALETTE, PRO_PALETTES, resolveTheme, type SiteThemeDefaults } from "../src/theme/palettes";

// WCAG 2.1 relative luminance and contrast ratio.
const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
};

const site: SiteThemeDefaults = { theme: "brand", proPalette: "cobalt", typeface: "sans" };

describe("resolveTheme", () => {
  it("uses the site defaults when there are no cookies", () => {
    expect(resolveTheme({}, site)).toEqual({ theme: "brand", mode: "system", palette: BRAND_PALETTE, typeface: "sans" });
  });

  it("gives Pro visitors the site's default Pro palette", () => {
    expect(resolveTheme({ theme: "pro", mode: "dark" }, site)).toEqual({
      theme: "pro",
      mode: "dark",
      palette: "cobalt",
      typeface: "sans",
    });
  });

  it("lets a visitor pick the serif display face", () => {
    expect(resolveTheme({ type: "serif" }, site).typeface).toBe("serif");
  });

  it("uses the site's default typeface when the cookie is missing", () => {
    expect(resolveTheme({}, { ...site, typeface: "serif" }).typeface).toBe("serif");
  });

  it("ignores cookie values it doesn't recognise", () => {
    expect(resolveTheme({ theme: "<script>", mode: "neon", type: "<script>" }, site)).toEqual({
      theme: "brand",
      mode: "system",
      palette: BRAND_PALETTE,
      typeface: "sans",
    });
  });

  it("falls back to a valid palette if the stored default is unknown", () => {
    const stale = { theme: "pro", proPalette: "removed", typeface: "sans" } as unknown as SiteThemeDefaults;
    expect(resolveTheme({}, stale).palette).toBe("amber");
  });

  it("falls back to sans if the stored default typeface is unknown", () => {
    const stale = { theme: "brand", proPalette: "amber", typeface: "gothic" } as unknown as SiteThemeDefaults;
    expect(resolveTheme({}, stale).typeface).toBe("sans");
  });
});

describe("palettes.css", () => {
  const css = readFileSync(new URL("../src/styles/palettes.css", import.meta.url), "utf8");
  const inCss = [...css.matchAll(/\[data-palette="([a-z]+)"\]/g)].map((m) => m[1]).sort();

  it("defines exactly the palettes the app offers", () => {
    expect(inCss).toEqual([BRAND_PALETTE, ...Object.keys(PRO_PALETTES)].sort());
  });

  it("keeps accent, accent-ink and muted text at AA (4.5:1) in every palette and mode", () => {
    for (const palette of [BRAND_PALETTE, ...Object.keys(PRO_PALETTES)]) {
      for (const side of ["light", "dark"] as const) {
        const c = colorsFromCss(css, palette, side);
        expect(contrast(c.accent, c.bg), `${palette}/${side} accent on bg`).toBeGreaterThanOrEqual(4.5);
        expect(contrast(c["accent-ink"], c.accent), `${palette}/${side} accent-ink on accent`).toBeGreaterThanOrEqual(4.5);
        expect(contrast(c.muted, c.bg), `${palette}/${side} muted on bg`).toBeGreaterThanOrEqual(4.5);
        expect(contrast(c.muted, c.surface), `${palette}/${side} muted on surface`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("gives every palette all 13 tokens as light-dark pairs", () => {
    for (const block of css.split(":root[data-palette=").slice(1)) {
      expect(block.match(/--[a-z0-9-]+: light-dark\(#[0-9a-f]{6}, #[0-9a-f]{6}\);/g)).toHaveLength(13);
    }
  });
});
