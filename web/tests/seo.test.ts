import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Seo from "../src/components/Seo.astro";
import * as robots from "../src/pages/robots.txt";
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

const renderSeo = async (props: Record<string, unknown>, path = "/") =>
  (await AstroContainer.create()).renderToString(Seo, { props, request: new Request(`http://internal:4321${path}`) });

describe("Seo", () => {
  it("builds canonical and Open Graph URLs from the public origin, not the request host", async () => {
    const html = await renderSeo({ title: "Work", image: "/og/work.png" }, "/work");
    expect(html).toContain(`<link rel="canonical" href="${ORIGIN}/work">`);
    expect(html).toContain(`<meta property="og:image" content="${ORIGIN}/og/work.png">`);
    expect(html).toContain("<title>Work · Jason Matherly</title>");
    expect(html).toContain('content="summary_large_image"');
  });

  it("marks private pages noindex and leaves out the Person JSON-LD", async () => {
    const html = await renderSeo({ title: "Sign in", noindex: true });
    expect(html).toContain('<meta name="robots" content="noindex, nofollow">');
    expect(html).not.toContain("application/ld+json");
  });

  it("sets theme-color from the palette: both sides when following the system, one when the mode is forced", async () => {
    const both = await renderSeo({ title: "Jason Matherly", themeColor: { light: "#f3f4f1", dark: "#0e1211" } });
    expect(both).toContain('<meta name="theme-color" media="(prefers-color-scheme: light)" content="#f3f4f1">');
    expect(both).toContain('<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0e1211">');
    const forced = await renderSeo({ title: "Jason Matherly", themeColor: "#0e1211" });
    expect(forced).toContain('<meta name="theme-color" content="#0e1211">');
    expect(forced).not.toContain("prefers-color-scheme");
  });

  it("adds Person JSON-LD to public pages", async () => {
    const html = await renderSeo({ title: "Jason Matherly" });
    const json = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/)![1]);
    expect(json).toMatchObject({ "@type": "Person", name: "Jason Matherly", url: `${ORIGIN}/` });
  });
});

describe("robots.txt and sitemap.xml", () => {
  // Neither endpoint reads its context, so call the handlers directly.
  const get = async (endpoint: typeof robots | typeof sitemap) => endpoint.GET({} as Parameters<typeof endpoint.GET>[0]);

  it("point crawlers at the sitemap on the public origin, away from the API, and let them read the account pages' noindex", async () => {
    const text = await (await get(robots)).text();
    expect(text).toContain(`Sitemap: ${ORIGIN}/sitemap.xml`);
    expect(text).toContain("Disallow: /api/");
    expect(text).not.toContain("Disallow: /sign-in");
  });

  it("list public pages with absolute URLs", async () => {
    const res = await get(sitemap);
    expect(res.headers.get("content-type")).toContain("application/xml");
    expect(await res.text()).toContain(`<loc>${ORIGIN}/</loc>`);
  });
});
