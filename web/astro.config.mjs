// @ts-check
import { defineConfig, fontProviders } from "astro/config";
import node from "@astrojs/node";
import tailwindcss from "@tailwindcss/vite";

// Fonts come from the installed @fontsource-variable packages; builds never fetch them.
const npmFonts = fontProviders.npm({ remote: false });

export default defineConfig({
  output: "server",
  adapter: node({ mode: "standalone" }),
  // better-auth keeps sessions in Postgres; the adapter's default filesystem driver
  // would also break across replicas.
  session: false,
  // Shiki highlights with inline styles, which the CSP blocks. Prism (class-based) is the CSP-safe option.
  markdown: { syntaxHighlight: false },
  // Content Security Policy, sent as a response header for on-demand pages. `astro dev` doesn't apply it:
  // check against a build. Astro hashes its own scripts and styles; Telemetry.astro adds the Umami/Sentry
  // origins configured on /admin per request.
  security: {
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
  vite: { plugins: [tailwindcss()] },
});
