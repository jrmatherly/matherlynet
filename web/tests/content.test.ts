import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Perspectives from "../src/components/Perspectives.astro";
import { perspectives } from "../src/data/profile";
import * as rss from "../src/pages/rss.xml";
import * as sitemap from "../src/pages/sitemap.xml";

const ORIGIN = "https://matherly.example";
let saved: string | undefined;
beforeEach(() => {
  saved = process.env.BETTER_AUTH_URL;
  process.env.BETTER_AUTH_URL = ORIGIN;
});
afterEach(() => {
  if (saved === undefined) delete process.env.BETTER_AUTH_URL;
  else process.env.BETTER_AUTH_URL = saved;
});

describe("Perspectives", () => {
  it("offers each audience as a radio option, with the first selected and a panel per option", async () => {
    const html = await (await AstroContainer.create()).renderToString(Perspectives);
    expect(perspectives.map((p) => p.label)).toEqual(["Recruiters", "Engineering leaders", "Security & governance"]);
    expect(html.match(/type="radio"/g)).toHaveLength(3);
    expect(html).toMatch(/value="recruiters"\s+checked/);
    for (const p of perspectives) expect(html).toContain(`data-panel="${p.id}"`);
  });
});

describe("feeds", () => {
  const get = async (endpoint: typeof rss | typeof sitemap) => endpoint.GET({} as Parameters<typeof endpoint.GET>[0]);

  it("serves an RSS 2.0 channel linked to the public origin", async () => {
    const res = await get(rss);
    expect(res.headers.get("content-type")).toContain("application/rss+xml");
    const xml = await res.text();
    expect(xml).toContain('<rss version="2.0">');
    expect(xml).toContain(`<link>${ORIGIN}/writing</link>`);
  });

  it("lists every public section in the sitemap", async () => {
    const xml = await (await get(sitemap)).text();
    for (const path of ["/", "/work", "/writing", "/about"]) expect(xml).toContain(`<loc>${new URL(path, ORIGIN).href}</loc>`);
  });
});
