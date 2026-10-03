import type { APIRoute } from "astro";
import { siteOrigin } from "../lib/site";

export const GET: APIRoute = () => {
  const sitemap = new URL("/sitemap.xml", siteOrigin()).href;
  // No Disallow for the account pages: their noindex has to be crawled to be honored.
  const body = ["User-agent: *", "Allow: /", "Disallow: /api/", "", `Sitemap: ${sitemap}`, ""].join("\n");
  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
};
