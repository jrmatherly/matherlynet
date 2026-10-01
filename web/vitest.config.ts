/// <reference types="vitest/config" />
import { getViteConfig } from "astro/config";

// The Container API renders .astro components in the Node environment (not jsdom).
// Vitest skips CSS by default; palettes.css is read as ?raw by the OG renderer, so process it.
export default getViteConfig({
  test: { environment: "node", include: ["tests/**/*.test.ts"], css: { include: [/palettes\.css/] } },
});
