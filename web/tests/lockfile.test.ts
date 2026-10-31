import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

// GitHub's dependency graph detects nothing in a two-document lockfile, and --frozen-lockfile accepts one.
it("pnpm-lock.yaml stays one YAML document", () => {
  expect(readFileSync(new URL("../pnpm-lock.yaml", import.meta.url), "utf8")).not.toMatch(/^---$/m);
});
