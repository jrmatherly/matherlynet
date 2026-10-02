import { describe, expect, it } from "vitest";
import { themeColorTags } from "../src/theme/theme-color";

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
