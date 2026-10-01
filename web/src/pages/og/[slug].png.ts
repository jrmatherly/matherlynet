import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { Renderer } from "@takumi-rs/core";
import type { APIRoute } from "astro";
import { render } from "takumi-js";
import mark from "../../../public/pro/logo-mark.svg?raw";
import { ogCards } from "../../lib/og";
import { person, siteOrigin } from "../../lib/site";
import { paletteColors } from "../../theme/colors";
import { SITE_DEFAULTS } from "../../theme/palettes";

const require = createRequire(import.meta.url);
const font = (path: string) => readFile(require.resolve(path));

// One renderer per process: fonts are decoded once and reused by every request.
const renderer = new Renderer();
const ready = Promise.all([
  font("@fontsource-variable/geist/files/geist-latin-wght-normal.woff2"),
  font("@fontsource-variable/geist-mono/files/geist-mono-latin-wght-normal.woff2"),
]).then(([sans, mono]) =>
  Promise.all([renderer.registerFont({ name: "Geist", data: sans }), renderer.registerFont({ name: "Geist Mono", data: mono })]),
);

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export const GET: APIRoute = async ({ params }) => {
  const slug = params.slug ?? "";
  // Own keys only: "constructor", "__proto__" etc. are inherited and would crash the renderer.
  const card = Object.hasOwn(ogCards, slug) ? ogCards[slug] : undefined;
  if (!card) return new Response("Not found", { status: 404 });

  // Colors come only from palettes.css, never from the request.
  const c = paletteColors(SITE_DEFAULTS.proPalette, "dark");
  const logo = mark.replaceAll("var(--accent, currentColor)", c.accent).replaceAll("currentColor", c.text);
  await ready;

  const html = `
<div style="display:flex;flex-direction:column;justify-content:space-between;width:100%;height:100%;padding:72px 80px;background:${c.bg};color:${c.text};font-family:Geist">
  <div style="display:flex;align-items:center;gap:20px">
    <img src="data:image/svg+xml;utf8,${encodeURIComponent(logo)}" width="64" height="64" />
    <span style="font-size:30px;font-weight:700;letter-spacing:-0.02em">${esc(person.name)}</span>
  </div>
  <div style="display:flex;flex-direction:column;gap:28px;border-left:8px solid ${c.accent};padding-left:40px">
    <div style="font-size:68px;font-weight:800;line-height:1.04;letter-spacing:-0.035em">${esc(card.title)}</div>
    <div style="font-size:30px;color:${c.muted}">${esc(card.subtitle)}</div>
  </div>
  <div style="display:flex;justify-content:flex-end;font-family:'Geist Mono';font-size:24px;color:${c.muted}">${esc(siteOrigin().host)}</div>
</div>`;

  const png = await render(html, { renderer, width: 1200, height: 630, format: "png" });
  return new Response(png, {
    headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" },
  });
};
