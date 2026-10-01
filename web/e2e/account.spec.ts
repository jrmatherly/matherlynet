import { expect, test } from "@playwright/test";
import { linkFromEmail } from "./mail";

// One account per run, walked through its whole life in order.
test.describe.configure({ mode: "serial" });

const email = `e2e-${Date.now()}@example.test`;
const password = `E2e-${crypto.randomUUID()}`;
const newPassword = `E2e-${crypto.randomUUID()}`;

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
  await expect(page.getByRole("status")).toHaveText(/Check your email/);
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
  // Not the admin-email account, so no admin link and no /admin.
  await expect(page.getByRole("link", { name: "Site settings" })).toHaveCount(0);
  expect((await page.goto("/admin"))?.status()).toBe(404);
});

test("signing out ends the session", async ({ page }) => {
  await signIn(page, password);
  await expect(page).toHaveURL(/\/account$/);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/account");
  await expect(page).toHaveURL(/\/sign-in$/);
});

test("a password reset by email replaces the old password", async ({ page }) => {
  await page.goto("/forgot-password");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("status")).toHaveText(/reset link is on its way/);

  await page.goto(await linkFromEmail(email, "Reset your password", "reset-password"));
  await expect(page).toHaveURL(/\/reset-password\?token=/);
  await page.getByLabel("New password").fill(newPassword);
  await page.getByRole("button", { name: "Set password" }).click();
  await expect(page.getByRole("status")).toHaveText(/Password updated/);

  await signIn(page, password);
  await expect(page.getByRole("alert")).toHaveText(/Invalid email or password/);
  await signIn(page, newPassword);
  await expect(page).toHaveURL(/\/account$/);
});
