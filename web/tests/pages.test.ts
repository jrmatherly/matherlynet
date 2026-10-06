import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { describe, expect, it } from "vitest";
import PlatformList from "../src/components/PlatformList.astro";
import WorkCard from "../src/components/WorkCard.astro";
import * as profile from "../src/data/profile";
import { ogCards } from "../src/lib/og";
import About from "../src/pages/about.astro";
import Changelog from "../src/pages/changelog.astro";
import Home from "../src/pages/index.astro";
import Playground from "../src/pages/playground.astro";
import Work from "../src/pages/work.astro";
import { SITE_DEFAULTS, resolveTheme } from "../src/theme/palettes";

const { work } = profile;
// Text as Astro renders it into HTML.
const esc = (s: string) => s.replaceAll("&", "&amp;").replaceAll("'", "&#39;").replaceAll('"', "&quot;");

const locals = {
  user: null,
  session: null,
  siteSettings: { ...SITE_DEFAULTS, sentry: { dsn: null, server: false, browser: false }, umami: { enabled: false, scriptUrl: null, websiteId: null } },
  theme: resolveTheme({}),
};

const page = async (Page: Parameters<AstroContainer["renderToString"]>[0], path: string, theme = locals.theme) =>
  (await AstroContainer.create()).renderToString(Page, { locals: { ...locals, theme }, request: new Request(`http://localhost${path}`) });

describe("About", () => {
  it("opens the résumé in a new tab and has no mono eyebrows", async () => {
    const html = await page(About, "/about");
    expect(html).toMatch(/<a[^>]*href="https:\/\/resume\.matherly\.net[^"]*"[^>]*target="_blank"[^>]*rel="noopener"/);
    expect(html).not.toMatch(/font-mono[^"]*uppercase|uppercase[^"]*font-mono/);
  });
});

describe("inner pages", () => {
  // Only the page body counts: the header and footer link everywhere, so they can't show a dead end.
  const mainLinks = (html: string) => [...(html.match(/<main[\s\S]*<\/main>/)?.[0] ?? "").matchAll(/href="(\/[a-z]+)"/g)].map((m) => m[1]);

  it("each link to another page from their body", async () => {
    expect(mainLinks(await page(About, "/about"))).toEqual(expect.arrayContaining(["/changelog", "/work"]));
    expect(mainLinks(await page(Changelog, "/changelog"))).toContain("/work");
    expect(mainLinks(await page(Work, "/work"))).toContain("/changelog");
    expect(mainLinks(await page(Playground, "/playground"))).toContain("/work");
  });
});

describe("tenure copy", () => {
  it("never says \"nearly 17\" on a page, in the profile data or on a share card", async () => {
    const pages = await Promise.all([page(About, "/about"), page(Home, "/"), page(Changelog, "/changelog")]);
    for (const text of [...pages, JSON.stringify(profile), JSON.stringify(ogCards)]) expect(text).not.toMatch(/nearly 17/i);
  });
});

describe("Changelog", () => {
  it("has one h1 and puts each milestone's and role's heading after its year, newest first", async () => {
    const html = await page(Changelog, "/changelog");
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html.match(/data-now="true"/g)).toHaveLength(1);
    const entries = profile.career.flatMap((role) => [...(role.milestones ?? []), { year: role.start.slice(-4), heading: role.heading, summary: undefined, highlights: role.highlights }]);
    let from = 0;
    for (const entry of entries) {
      const year = html.indexOf(`>${entry.year}</span>`, from);
      const heading = html.indexOf(esc(entry.heading), year);
      expect(year, `${entry.heading} year`).toBeGreaterThan(-1);
      expect(heading, `${entry.heading} heading`).toBeGreaterThan(year);
      for (const text of [entry.summary, ...entry.highlights]) if (text) expect(html.indexOf(esc(text), heading), `${entry.heading}: ${text.slice(0, 40)}`).toBeGreaterThan(heading);
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

describe("Work", () => {
  it("puts each platform in its group's section, in the data's order", async () => {
    const html = await page(Work, "/work");
    const sections = html.split(/<section aria-label="/).slice(1);
    expect(sections.map((s) => s.slice(0, s.indexOf('"')))).toEqual([...profile.workGroups]);
    for (const [i, group] of profile.workGroups.entries()) {
      const titles = [...sections[i].matchAll(/<h3[^>]*>([^<]*)<\/h3>/g)].map((m) => m[1]);
      expect(titles).toEqual(work.filter((w) => w.group === group).map((w) => esc(w.title)));
    }
  });
});

describe("PlatformList", () => {
  it("lists the AI platform items except the gateway, in the data's order", async () => {
    const html = await (await AstroContainer.create()).renderToString(PlatformList);
    const titles = [...html.matchAll(/<h3[^>]*>([^<]*)<\/h3>/g)].map((m) => m[1]);
    const expected = work.filter((w) => w.group === "AI platform" && w.title !== profile.gateway.title).map((w) => esc(w.title));
    expect(expected.length).toBeGreaterThan(0);
    expect(titles).toEqual(expected);
  });
});
