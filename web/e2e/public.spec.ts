import { expect, test } from "@playwright/test";

test("public pages render and the nav links work", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Jason Matherly/);
  for (const label of ["Work", "Changelog", "Playground", "About"]) {
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: label }).click();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: label, exact: true })).toHaveAttribute("aria-current", "page");
  }
  // Writing stays out of the nav until the first post.
  await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Writing" })).toHaveCount(0);
});

test("each perspective's panel shows when it is picked", async ({ page }) => {
  await page.goto("/");
  for (const id of ["leaders", "security", "recruiters"]) {
    await page.locator(`label:has(input[value="${id}"])`).click();
    await expect(page.locator(`[data-panel="${id}"]`)).toBeVisible();
  }
});

test("the playground refuses personal data and logs every request", async ({ page }) => {
  await page.goto("/playground?try=secret");
  await expect(page.locator('[data-panel="secret"]')).toBeVisible();
  const yours = page.locator("label", { hasText: "Your own request" });
  await expect(yours).toBeVisible();
  await yours.click();
  await page.getByRole("textbox", { name: "Your request" }).fill("my email is a@b.co");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.locator("[data-yours] li", { hasText: "personal data" }).first()).toBeVisible();
  const rows = page.locator("[data-log] tr");
  await expect(rows.first()).toContainText("refused");
  const before = await rows.count();
  await page.locator("label", { hasText: "Send 10 at once" }).click();
  await expect(rows).toHaveCount(before + 10);
});

test("the theme choice survives a reload", async ({ page }) => {
  await page.goto("/");
  const html = page.locator("html");
  // Brand and then Pro, each across a reload: whichever the /admin default is, one of them differs from it.
  await page.getByRole("button", { name: "Brand" }).click();
  await page.reload();
  await expect(html).toHaveAttribute("data-palette", "signal");
  await page.getByRole("button", { name: "Pro" }).click();
  await page.getByRole("button", { name: "Dark" }).click();
  // A forced mode re-syncs theme-color to one tag with no media query.
  await expect(page.locator('meta[name="theme-color"]')).toHaveCount(1);
  await expect(page.locator('meta[name="theme-color"]')).not.toHaveAttribute("media");
  await page.getByRole("button", { name: "Serif" }).click();
  await page.reload();
  await expect(html).not.toHaveAttribute("data-palette", "signal");
  await expect(html).toHaveAttribute("data-mode", "dark");
  await expect(html).toHaveAttribute("data-type", "serif");
});

test("unknown pages return 404", async ({ page }) => {
  const response = await page.goto("/no-such-page");
  expect(response?.status()).toBe(404);
});

test("signed-out visitors can't reach account pages", async ({ page }) => {
  await page.goto("/account");
  await expect(page).toHaveURL(/\/sign-in$/);
  expect((await page.goto("/admin"))?.status()).toBe(404);
});

test("responses carry the security headers", async ({ request }) => {
  const headers = (await request.get("/")).headers();
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
});
