import { defineConfig, devices } from "@playwright/test";

// End-to-end tests against the stack Aspire runs (`aspire start` first): the app at :4321, Mailpit for email.
// `pnpm e2e`; set E2E_BASE_URL / MAILPIT_URL to point elsewhere. live.spec.ts with the model on also reads APPDB_URI,
// which must name a loopback database: it deletes rows.
export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:4321",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
