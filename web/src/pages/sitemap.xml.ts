import type { APIRoute } from "astro";
import { publicRoutes, siteOrigin } from "../lib/site";
import { publishedPosts } from "../lib/writing";

// Built at request time: pages are server-rendered and the public origin is only known at run time.
export const GET: APIRoute = async () => {
  const origin = siteOrigin();
  const paths = [...publicRoutes.map((r) => r.path), ...(await publishedPosts()).map((p) => `/writing/${p.id}`)];
  const urls = paths.map((path) => `  <url><loc>${new URL(path, origin).href}</loc></url>`).join("\n");
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  return new Response(body, {
    headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
};
