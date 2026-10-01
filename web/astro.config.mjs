// @ts-check
import { defineConfig, fontProviders } from "astro/config";
import node from "@astrojs/node";
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
  // Content Security Policy, sent as a response header for on-demand pages. `astro dev` doesn't apply it:
  // check against a build. Astro hashes its own scripts and styles; Telemetry.astro adds the Umami/Sentry
  // origins configured on /admin per request.
  security: {
    // Behind Cloudflare the container sees plain HTTP. With a protocol pattern here, Astro trusts
    // X-Forwarded-Proto: https, so the origin check compares https://<Host>, which is what browsers send.
    // Baked in at build time. Side effect: a request whose (X-Forwarded-)Host matches makes Astro.clientAddress
    // the first X-Forwarded-For value, and clients can send both headers through Cloudflare. Don't use
    // clientAddress; better-auth reads cf-connecting-ip.
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
      provider: npmFonts,
      name: "Geist Variable",
      cssVariable: "--font-geist",
      weights: ["100 900"],
      styles: ["normal"],
      options: { package: "@fontsource-variable/geist" },
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
