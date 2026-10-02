import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { describe, expect, it } from "vitest";
import WorkCard from "../src/components/WorkCard.astro";
import * as profile from "../src/data/profile";
import { ogCards } from "../src/lib/og";
import About from "../src/pages/about.astro";
import Changelog from "../src/pages/changelog.astro";
import Home from "../src/pages/index.astro";
import { SITE_DEFAULTS, resolveTheme } from "../src/theme/palettes";

const { work } = profile;

const locals = {
  user: null,
  session: null,
  siteSettings: { ...SITE_DEFAULTS, sentry: { dsn: null, server: false, browser: false }, umami: { enabled: false, scriptUrl: null, websiteId: null } },
  theme: resolveTheme({}),
};

const page = async (Page: Parameters<AstroContainer["renderToString"]>[0], path: string, theme = locals.theme) =>
  (await AstroContainer.create()).renderToString(Page, { locals: { ...locals, theme }, request: new Request(`http://localhost${path}`) });

describe("About", () => {
  it("shows year-only role dates on one line, opens the résumé in a new tab, and has no mono eyebrows", async () => {
    const html = await page(About, "/about");
    expect(html).toMatch(/whitespace-nowrap[^>]*>\s*2015 to 2021\s*</);
    expect(html).toMatch(/<a[^>]*href="https:\/\/resume\.matherly\.net[^"]*"[^>]*target="_blank"[^>]*rel="noopener"/);
    expect(html).not.toMatch(/font-mono[^"]*uppercase|uppercase[^"]*font-mono/);
  });
});

describe("tenure copy", () => {
  it("never says \"nearly 17\" on a page, in the profile data or on a share card", async () => {
    const pages = await Promise.all([page(About, "/about"), page(Home, "/"), page(Changelog, "/changelog")]);
    for (const text of [...pages, JSON.stringify(profile), JSON.stringify(ogCards)]) expect(text).not.toMatch(/nearly 17/i);
  });
});

describe("Changelog", () => {
  it("has one h1 and puts each role's heading after its start year, newest first", async () => {
    const html = await page(Changelog, "/changelog");
    expect(html.match(/<h1/g)).toHaveLength(1);
    let from = 0;
    for (const role of profile.career) {
      const year = html.indexOf(`>${role.start.slice(-4)}`, from);
      const heading = html.indexOf(role.heading, year);
      expect(year, `${role.title} year`).toBeGreaterThan(-1);
      expect(heading, `${role.title} heading`).toBeGreaterThan(year);
      from = heading;
    }
  });
});

describe("Base", () => {
  it("gives a forced dark mode one theme-color tag and puts the typeface on <html>", async () => {
    const html = await page(About, "/about", { theme: "pro", mode: "dark", palette: "paper", typeface: "serif" });
    expect(html).toMatch(/<html[^>]*data-type="serif"/);
    const tags = html.match(/<meta name="theme-color"[^>]*>/g) ?? [];
    expect(tags).toHaveLength(1);
    expect(tags[0]).not.toContain("media");
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
