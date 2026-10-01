// Renders the GitHub social preview (Settings → General → Social preview) to .github/social-preview.png.
// Run from web/: `node scripts/social-preview.mts [palette]` (default: the site's default Pro palette).
// GitHub's template is 1280×640 with an 80px safe border; everything that matters sits inside it.
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { Renderer } from "@takumi-rs/core";
import { render } from "takumi-js";
import { colorsFromCss } from "../src/theme/palette-css.ts";
import { SITE_DEFAULTS } from "../src/theme/palettes.ts";

const require = createRequire(import.meta.url);
const here = (path: string) => new URL(path, import.meta.url);

const palette = process.argv[2] ?? SITE_DEFAULTS.proPalette;
const c = colorsFromCss(await readFile(here("../src/styles/palettes.css"), "utf8"), palette, "dark");
const logo = (await readFile(here("../public/pro/logo-mark.svg"), "utf8"))
  .replaceAll("var(--accent, currentColor)", c.accent)
  .replaceAll("currentColor", c.text);

const renderer = new Renderer();
await renderer.registerFont({ name: "Geist", data: await readFile(require.resolve("@fontsource-variable/geist/files/geist-latin-wght-normal.woff2")) });
await renderer.registerFont({
  name: "Geist Mono",
  data: await readFile(require.resolve("@fontsource-variable/geist-mono/files/geist-mono-latin-wght-normal.woff2")),
});

const stack = ["Astro SSR", "better-auth", "PostgreSQL", "Aspire", "OpenTelemetry", "Playwright"];
const chip = `display:flex;padding:8px 18px;border:2px solid ${c.border};border-radius:999px;background:${c.surface}`;

const html = `
<div style="display:flex;flex-direction:column;justify-content:space-between;width:100%;height:100%;padding:80px;background:${c.bg};color:${c.text};font-family:Geist">
  <div style="display:flex;align-items:center;gap:22px">
    <img src="data:image/svg+xml;utf8,${encodeURIComponent(logo)}" width="72" height="72" />
    <span style="font-family:'Geist Mono';font-size:34px;color:${c.muted}">jrmatherly / <span style="color:${c.text};font-weight:700">matherlynet</span></span>
  </div>
  <div style="display:flex;flex-direction:column;gap:22px;border-left:8px solid ${c.accent};padding-left:40px">
    <div style="font-size:66px;font-weight:800;line-height:1.05;letter-spacing:-0.035em">Jason Matherly's site, run like a production platform.</div>
    <div style="font-size:28px;color:${c.muted}">One Aspire AppHost for local dev, Docker Compose and Kubernetes.</div>
  </div>
  <div style="display:flex;flex-wrap:wrap;gap:14px;font-family:'Geist Mono';font-size:22px;color:${c.text}">
    ${stack.map((s) => `<div style="${chip}">${s}</div>`).join("")}
  </div>
</div>`;

const out = here("../../.github/social-preview.png");
await writeFile(out, await render(html, { renderer, width: 1280, height: 640, format: "png" }));
console.log(`wrote ${out.pathname} (${palette})`);
