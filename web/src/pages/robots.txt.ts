import type { APIRoute } from "astro";
import { siteOrigin } from "../lib/site";

export const GET: APIRoute = () => {
  const sitemap = new URL("/sitemap.xml", siteOrigin()).href;
  const body = ["User-agent: *", "Allow: /", "Disallow: /api/", "Disallow: /sign-in", "", `Sitemap: ${sitemap}`, ""].join("\n");
  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
};
