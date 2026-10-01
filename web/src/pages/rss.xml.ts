import type { APIRoute } from "astro";
import { person, siteOrigin } from "../lib/site";
import { publishedPosts } from "../lib/writing";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export const GET: APIRoute = async () => {
  const origin = siteOrigin();
  const items = (await publishedPosts())
    .map((p) => {
      const link = new URL(`/writing/${p.id}`, origin).href;
      return `    <item><title>${esc(p.data.title)}</title><link>${link}</link><guid>${link}</guid><pubDate>${p.data.pubDate.toUTCString()}</pubDate><description>${esc(p.data.description)}</description></item>`;
    })
    .join("\n");
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${esc(person.name)}: Writing</title>
    <link>${new URL("/writing", origin).href}</link>
    <description>Notes on AI platforms, governance and infrastructure.</description>
    <language>en-us</language>
${items}
  </channel>
</rss>
`;
  return new Response(body, {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
};
