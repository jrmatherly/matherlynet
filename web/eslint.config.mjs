// @ts-check
import { defineConfig } from "eslint/config";
import astro from "eslint-plugin-astro";
import tseslint from "typescript-eslint";

export default defineConfig(
  // Generated: build output, Astro types, migrations and the better-auth schema.
  { ignores: ["dist/", ".astro/", "drizzle/", "src/db/auth-schema.ts"] },
  tseslint.configs.recommended,
  astro.configs.recommended,
  astro.configs["jsx-a11y-recommended"],
);
