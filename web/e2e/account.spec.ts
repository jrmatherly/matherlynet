import { expect, test } from "@playwright/test";
import pg from "pg";
import { localAppDb } from "./db";
import { linkFromEmail } from "./mail";

// One account per run, walked through its whole life in order.
test.describe.configure({ mode: "serial" });

const email = `e2e-${Date.now()}@example.test`;
const password = `E2e-${crypto.randomUUID()}`;
const newPassword = `E2e-${crypto.randomUUID()}`;
// Setting a password waits on the breached-password lookup, which the server allows 5 s (pwnedPasswordCheck), so
// the default 5 s expect could lose to a slow lookup the server would still accept.
const passwordSet = { timeout: 15_000 };

async function signIn(page: import("@playwright/test").Page, pass: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(pass);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

test("sign-up asks the visitor to confirm their email", async ({ page }) => {
  await page.goto("/sign-up");
  await page.getByLabel("Name").fill("E2E Visitor");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page.getByRole("status")).toHaveText(/Check your email/, passwordSet);
});

test("an unverified account can't sign in", async ({ page }) => {
  await signIn(page, password);
  await expect(page.getByRole("alert")).toHaveText(/Verify your email first/);
});

test("the emailed link verifies the address and signs the visitor in", async ({ page }) => {
  await page.goto(await linkFromEmail(email, "Verify your email", "verify-email"));
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByText(email)).toBeVisible();
  await expect(page.getByText("(this device)")).toBeVisible();
  // Session times name their zone: the server's zone isn't the visitor's.
  await expect(page.getByText(/signed in .+ UTC/)).toBeVisible();
  // Not the admin-email account, so no admin link and no /admin.
  await expect(page.getByRole("link", { name: "Site settings" })).toHaveCount(0);
  expect((await page.goto("/admin"))?.status()).toBe(404);
});

test("a session older than a day still opens the account page", async ({ page }) => {
  // The page lists sessions through better-auth, which refuses a stale one unless freshAge is 0 (auth.ts).
  const appdb = localAppDb();
  await signIn(page, password);
  await expect(page).toHaveURL(/\/account$/);
  const db = new pg.Client({ connectionString: appdb });
  await db.connect();
  const { rowCount } = await db.query(
    `update session set created_at = now() - interval '2 days' where user_id = (select id from "user" where email = $1)`,
    [email],
  );
  await db.end();
  expect(rowCount).toBeGreaterThan(0);
  expect((await page.goto("/account"))?.status()).toBe(200);
  await expect(page.getByText("(this device)")).toBeVisible();
});

test("signing out ends the session", async ({ page }) => {
  await signIn(page, password);
  await expect(page).toHaveURL(/\/account$/);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/account");
  await expect(page).toHaveURL(/\/sign-in$/);
});

// Earlier tests leave sessions behind, and in E2E they share an IP and sign-in time, so only the user agent tells the rows apart.
async function otherDevice(browser: import("@playwright/test").Browser, userAgent: string) {
  const context = await browser.newContext({ userAgent });
  const other = await context.newPage();
  await signIn(other, password);
  await expect(other).toHaveURL(/\/account$/);
  return { context, other };
}

test("revoking another device's session signs that device out", async ({ page, browser }) => {
  const { context, other } = await otherDevice(browser, "e2e-other");
  await signIn(page, password);
  await expect(page).toHaveURL(/\/account$/);
  const row = page.getByRole("listitem").filter({ hasText: "e2e-other" });
  await expect(row).toHaveCount(1);
  await row.getByRole("button", { name: "Revoke" }).click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByText("e2e-other")).toHaveCount(0);
  await expect(page.getByText("(this device)")).toBeVisible();
  await other.goto("/account");
  await expect(other).toHaveURL(/\/sign-in$/);
  await context.close();
});

test("signing out other devices leaves only this session", async ({ page, browser }) => {
  const { context, other } = await otherDevice(browser, "e2e-third");
  await signIn(page, password);
  await expect(page).toHaveURL(/\/account$/);
  await page.getByRole("button", { name: "Sign out other devices" }).click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByText("(this device)")).toBeVisible();
  await expect(page.getByRole("button", { name: "Revoke" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Sign out other devices" })).toHaveCount(0);
  await other.goto("/account");
  await expect(other).toHaveURL(/\/sign-in$/);
  await context.close();
});

test("a password reset by email replaces the old password", async ({ page }) => {
  await page.goto("/forgot-password");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("status")).toHaveText(/reset link is on its way/);

  await page.goto(await linkFromEmail(email, "Reset your password", "reset-password"));
  // The page keeps the token in its form and drops it from the address bar (history, Referer, error reports).
  await expect(page).toHaveURL(/\/reset-password$/);
  await page.getByLabel("New password").fill(newPassword);
  await page.getByRole("button", { name: "Set password" }).click();
  await expect(page.getByRole("status")).toHaveText(/Password updated/, passwordSet);

  await signIn(page, password);
  await expect(page.getByRole("alert")).toHaveText(/Invalid email or password/);
  await signIn(page, newPassword);
  await expect(page).toHaveURL(/\/account$/);
});
