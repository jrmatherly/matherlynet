import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BRAND_PALETTE, PRO_PALETTES, resolveTheme, type SiteThemeDefaults } from "../src/theme/palettes";

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

  it("gives every palette all 13 tokens as light-dark pairs", () => {
    for (const block of css.split(":root[data-palette=").slice(1)) {
      expect(block.match(/--[a-z0-9-]+: light-dark\(#[0-9a-f]{6}, #[0-9a-f]{6}\);/g)).toHaveLength(13);
    }
  });
});
