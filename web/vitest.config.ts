/// <reference types="vitest/config" />
import { getViteConfig } from "astro/config";

// The Container API renders .astro components in the Node environment (not jsdom).
export default getViteConfig({
  test: { environment: "node", include: ["tests/**/*.test.ts"] },
});
