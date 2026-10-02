import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { describe, expect, it } from "vitest";
import RailEntry from "../src/components/RailEntry.astro";

describe("RailEntry", () => {
  it("renders the year column and marks the current entry", async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(RailEntry, { props: { year: "2026", now: true, meta: "Manager" }, slots: { default: "<p>body</p>" } });
    expect(html).toContain("2026");
    expect(html).toContain("Manager");
    expect(html).toMatch(/data-now="true"/);
    expect(html).toContain("<p>body</p>");
  });

  it("puts the anchor id on a box that can be scrolled to, not on the display:contents wrapper", async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(RailEntry, { props: { year: "2015", id: "career" } });
    expect(html).not.toMatch(/<section[^>]*id="career"/);
    expect(html).toMatch(/<div[^>]*id="career"/);
  });
});
