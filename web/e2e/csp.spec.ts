import { expect, test } from "@playwright/test";

const pages = ["/", "/about", "/work", "/changelog", "/writing", "/playground", "/sign-in"];

// The dev server sends no CSP (astro.config.mjs); global-setup.ts detects it the same way.
test.beforeEach(async ({ request }) => {
  const html = await (await request.get("/")).text();
  test.skip(html.includes("/@vite/client"), "astro dev sends no CSP");
});

for (const path of pages) {
  test(`${path} sends the CSP and nothing on it is blocked`, async ({ page }) => {
    const violations: string[] = [];
    page.on("console", (m) => { if (/Content Security Policy/i.test(m.text())) violations.push(m.text()); });
    const response = await page.goto(path);
    expect(response?.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
    await page.waitForLoadState("networkidle");
    expect(violations).toEqual([]);
  });
}
