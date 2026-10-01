import { describe, expect, it } from "vitest";
import { stripQuery } from "../src/lib/scrub-url";

describe("stripQuery", () => {
  it("drops query strings and fragments", () => {
    expect(stripQuery("https://matherly.net/reset-password?token=abc#x")).toBe("https://matherly.net/reset-password");
  });
  it("leaves non-strings alone", () => {
    expect(stripQuery(undefined)).toBeUndefined();
  });
});
