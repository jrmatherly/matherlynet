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
