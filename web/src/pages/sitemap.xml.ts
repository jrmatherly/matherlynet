import type { APIRoute } from "astro";
import { publicRoutes, siteOrigin } from "../lib/site";

// Built at request time: pages are server-rendered and the public origin is only known at run time.
export const GET: APIRoute = () => {
  const origin = siteOrigin();
  const urls = publicRoutes.map((r) => `  <url><loc>${new URL(r.path, origin).href}</loc></url>`).join("\n");
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  return new Response(body, {
    headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
};
