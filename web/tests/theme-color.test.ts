import { describe, expect, it } from "vitest";
import { themeColorFor, themeColorTags } from "../src/theme/theme-color";

describe("themeColorFor", () => {
  const bg = (side: "light" | "dark") => (side === "light" ? "#f3f4f1" : "#0e1211");

  it("gives a forced mode that side's color, not a pair that would follow the OS", () => {
    expect(themeColorFor("dark", bg)).toBe("#0e1211");
    expect(themeColorFor("light", bg)).toBe("#f3f4f1");
  });

  it("gives system mode, or anything unrecognised, the light/dark pair", () => {
    for (const mode of ["system", undefined, "neon"]) expect(themeColorFor(mode, bg)).toEqual({ light: "#f3f4f1", dark: "#0e1211" });
  });
});

describe("themeColorTags", () => {
  it("gives a forced mode one tag, so the browser chrome follows the page", () => {
    expect(themeColorTags("#0e1211")).toEqual([{ content: "#0e1211" }]);
  });

  it("gives system mode a light/dark pair behind prefers-color-scheme", () => {
    expect(themeColorTags({ light: "#f3f4f1", dark: "#0e1211" })).toEqual([
      { media: "(prefers-color-scheme: light)", content: "#f3f4f1" },
      { media: "(prefers-color-scheme: dark)", content: "#0e1211" },
    ]);
  });
});
