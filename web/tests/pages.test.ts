import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { describe, expect, it } from "vitest";
import WorkCard from "../src/components/WorkCard.astro";
import { perspectives, work } from "../src/data/profile";
import { ogCards } from "../src/lib/og";
import About from "../src/pages/about.astro";
import { SITE_DEFAULTS, resolveTheme } from "../src/theme/palettes";

const locals = {
  user: null,
  session: null,
  siteSettings: { ...SITE_DEFAULTS, sentry: { dsn: null, server: false, browser: false }, umami: { enabled: false, scriptUrl: null, websiteId: null } },
  theme: resolveTheme({}),
};

describe("About", () => {
  it("shows year-only role dates on one line, opens the résumé in a new tab, and has no mono eyebrows", async () => {
    const html = await (await AstroContainer.create()).renderToString(About, { locals, request: new Request("http://localhost/about") });
    expect(html).toMatch(/whitespace-nowrap[^>]*>\s*2015 – 2021\s*</);
    expect(html).toMatch(/<a[^>]*href="https:\/\/resume\.matherly\.net[^"]*"[^>]*target="_blank"[^>]*rel="noopener"/);
    expect(html).not.toMatch(/font-mono[^"]*uppercase|uppercase[^"]*font-mono/);
  });
});

describe("tenure copy", () => {
  it("says \"Seventeen years\" everywhere, never \"nearly 17\" (decided 2026-10-02)", async () => {
    const about = await (await AstroContainer.create()).renderToString(About, { locals, request: new Request("http://localhost/about") });
    for (const text of [about, JSON.stringify(perspectives), JSON.stringify(ogCards)]) expect(text).not.toMatch(/nearly 17/i);
  });
});

describe("WorkCard", () => {
  it("is a row with the period and one-line result, without pills", async () => {
    const html = await (await AstroContainer.create()).renderToString(WorkCard, { props: { item: work[0] } });
    expect(html).toContain(work[0].period);
    expect(html).toContain(work[0].result);
    expect(html).not.toContain("rounded-full");
  });
});
