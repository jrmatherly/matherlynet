// @ts-check
import { defineConfig, fontProviders } from "astro/config";
import node from "@astrojs/node";
import mdx from "@astrojs/mdx";
import tailwindcss from "@tailwindcss/vite";
import { sentryVitePlugin } from "@sentry/bundler-plugins/vite";

// Fonts come from the installed @fontsource-variable packages; builds never fetch them.
const npmFonts = fontProviders.npm({ remote: false });

export default defineConfig({
  output: "server",
  adapter: node({ mode: "standalone" }),
  // better-auth keeps sessions in Postgres; the adapter's default filesystem driver
  // would also break across replicas.
  session: false,
  // Prism, not the default Shiki: Shiki highlights with inline styles, which the CSP blocks. Prism emits
  // token classes, colored from the palette in global.css.
  markdown: { syntaxHighlight: "prism" },
  // MDX inherits the markdown config (Prism included); it lets a post embed a component such as GatewayPath.
  integrations: [mdx()],
  // Content Security Policy, sent as a response header for on-demand pages. `astro dev` doesn't apply it:
  // check against a build. Astro hashes its own scripts and styles; Telemetry.astro adds the Umami/Sentry
  // origins configured on /admin per request.
  security: {
    // Behind Cloudflare the container sees plain HTTP. With a protocol pattern here, Astro trusts
    // X-Forwarded-Proto: https, so the origin check compares https://<Host>, which is what browsers send (any host:
    // the URL is built from the raw Host header). The hostname only decides whether X-Forwarded-Host is trusted
    // and, with it, Astro.clientAddress: a request with X-Forwarded-Host: matherly.net (clients can send it
    // through Cloudflare) makes clientAddress the first X-Forwarded-For value. Don't use clientAddress; better-auth
    // reads cf-connecting-ip. better-auth also accepts only BETTER_AUTH_URL's origin: www must redirect to the apex
    // (docs/deployment.md). Read at build time.
    allowedDomains: [{ hostname: "matherly.net", protocol: "https" }],
    csp: {
      directives: [
        "default-src 'self'",
        "connect-src 'self'",
        "img-src 'self' data:",
        "font-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
      ],
      // Explicit, because an inserted resource (the Umami origin) replaces Astro's default 'self'.
      scriptDirective: { resources: ["'self'"] },
    },
  },
  fonts: [
    {
      // Latin only, through the local provider: the npm provider reads every @font-face in the package (unifont
      // 0.7.5 ignores `subsets` there), so Cyrillic, Greek and Latin Extended were preloaded on every page too.
      provider: fontProviders.local(),
      name: "Geist Variable",
      cssVariable: "--font-geist",
      options: {
        variants: [{ weight: "100 900", style: "normal", src: ["@fontsource-variable/geist/files/geist-latin-wght-normal.woff2"] }],
      },
    },
    {
      provider: npmFonts,
      name: "Geist Mono Variable",
      cssVariable: "--font-geist-mono",
      weights: ["100 900"],
      styles: ["normal"],
      fallbacks: ["monospace"],
      options: { package: "@fontsource-variable/geist-mono" },
    },
    {
      // Local provider on the fontsource files: the npm provider parses one CSS file per family (index.css by
      // default), and no Newsreader file declares both the normal and the italic face.
      provider: fontProviders.local(),
      name: "Newsreader Variable",
      cssVariable: "--font-newsreader",
      fallbacks: ["Georgia", "serif"],
      options: {
        variants: [
          { weight: "200 800", style: "normal", src: ["@fontsource-variable/newsreader/files/newsreader-latin-wght-normal.woff2"] },
          { weight: "200 800", style: "italic", src: ["@fontsource-variable/newsreader/files/newsreader-latin-wght-italic.woff2"] },
        ],
      },
    },
  ],
  vite: {
    // Hidden source maps (no sourceMappingURL comment) with Sentry debug IDs injected into bundles and maps.
    // The image build has no Sentry token, so nothing uploads here: CI copies dist/ out of the pushed image and
    // uploads the maps (publish-images.yml). The release comes from SENTRY_RELEASE at run time, not the build.
    build: { sourcemap: "hidden" },
    plugins: [
      tailwindcss(),
      sentryVitePlugin({ telemetry: false, sourcemaps: { disable: "disable-upload" }, release: { inject: false, create: false } }),
    ],
  },
});
