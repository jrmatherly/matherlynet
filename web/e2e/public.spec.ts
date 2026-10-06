import { expect, test } from "@playwright/test";

// Pixels of horizontal overflow on the page, 0 when it fits (run in the browser).
const sidewaysScroll = () => document.documentElement.scrollWidth - document.documentElement.clientWidth;

test("public pages render and the nav links work", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Jason Matherly/);
  for (const label of ["Work", "Changelog", "Playground", "Writing", "About"]) {
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: label }).click();
    // aria-current first: it only holds on the new page, so the heading check below can't pass on the old one.
    await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: label, exact: true })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }
});

test("the nav fits one row on a 360px phone", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  const tops = await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link")
    .evaluateAll((links) => links.map((a) => a.getBoundingClientRect().top));
  expect(new Set(tops).size).toBe(1);
  expect(await page.evaluate(sidewaysScroll)).toBe(0);
});

test("no page scrolls sideways on a 320px phone", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 780 });
  for (const path of ["/", "/writing/ai-gateway-three-generations", "/no-such-page"]) {
    await page.goto(path);
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(sidewaysScroll), path).toBe(0);
  }
});

test("the case study opens from Writing with its figure and table", async ({ page }) => {
  await page.goto("/writing");
  await page.getByRole("link", { name: /One gateway, three generations/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "One gateway, three generations" })).toBeVisible();
  // One visible figure per generation (getByRole skips the gateway drawing hidden at this width).
  await expect(page.locator("article").getByRole("img")).toHaveCount(3);
  await expect(page.getByRole("table")).toBeVisible();
  // The CSP blocks inline styles, and the dev server this runs against doesn't send the CSP.
  await expect(page.locator("article [style]")).toHaveCount(0);
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", /\/og\/writing\.png\?v=/);
});

test("the gateway figure stacks on phones and stays wide from sm up", async ({ page }) => {
  const wide = page.locator("svg:has(#path-title)");
  const stacked = page.locator("svg:has(#path-stacked-title)");
  for (const path of ["/", "/writing/ai-gateway-three-generations"]) {
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto(path);
      await page.evaluate(() => document.fonts.ready);
      await expect(stacked, `${path} at ${width}`).toBeVisible();
      await expect(wide, `${path} at ${width}`).toBeHidden();
      expect(await page.evaluate(sidewaysScroll), `${path} at ${width}`).toBe(0);
      // Drawn at full size or larger, so its 11-unit names render at 11px or more.
      const scale = await stacked.evaluate((el: SVGSVGElement) => el.getBoundingClientRect().width / el.viewBox.baseVal.width);
      expect(scale, `${path} at ${width}`).toBeGreaterThanOrEqual(1);
    }
    await page.setViewportSize({ width: 640, height: 844 });
    await page.goto(path);
    await expect(wide, `${path} at 640`).toBeVisible();
    await expect(stacked, `${path} at 640`).toBeHidden();
  }
});

test("the feed and sitemap carry the case study and no drafts", async ({ request }) => {
  for (const path of ["/rss.xml", "/sitemap.xml"]) {
    const xml = await (await request.get(path)).text();
    expect(xml, path).toContain("/writing/ai-gateway-three-generations<");
    expect(xml, path).not.toContain("first-post");
  }
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
  // The masked email marks the newest log row as this request's, not a recorded one.
  const rows = page.locator("[data-log] tr");
  await expect(rows.first()).toContainText("a@••co");
  await expect(rows.first()).toContainText("refused");
  const before = await rows.count();
  await page.locator("label", { hasText: "Send 10 at once" }).click();
  await expect(rows).toHaveCount(before + 10);
  await expect(page.locator("[data-log] tr", { hasText: "Rate limits" }).first()).toBeVisible();
  await page.locator("label", { hasText: "Call an unlisted tool" }).click();
  const tool = page.locator('[data-panel="unlisted-tool"]');
  await expect(tool.locator("[data-live] [data-step]")).toHaveCount(2);
  await expect(tool).toContainText("Refused at Registry");
  await yours.click();
  await page.getByRole("textbox", { name: "Your request" }).clear();
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Type something first." })).toBeVisible();
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

test("unknown pages and draft posts return 404", async ({ page }) => {
  const response = await page.goto("/no-such-page");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("navigation", { name: "Pages" }).first().getByRole("link", { name: "Writing" })).toBeVisible();
  expect((await page.goto("/writing/first-post"))?.status()).toBe(404);
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
