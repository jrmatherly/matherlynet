import type { BetterAuthOptions } from "better-auth";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const set = vi.fn(() => ({ where: vi.fn() }));
vi.mock("../src/db", () => ({ db: { update: () => ({ set }) } }));
vi.mock("../src/lib/mail", () => ({ sendMail: vi.fn() }));

const ADMIN = "owner@example.test";
let hooks: NonNullable<NonNullable<BetterAuthOptions["databaseHooks"]>["user"]>;

beforeAll(async () => {
  vi.stubEnv("ADMIN_EMAIL", ADMIN);
  const { auth } = await import("../src/lib/auth");
  hooks = (auth.options as BetterAuthOptions).databaseHooks!.user!;
});
beforeEach(() => set.mockClear());

// What better-auth passes: before(data, ctx) and after(updatedUser, ctx), ctx being the endpoint's context.
const update = async (data: Record<string, unknown>, user: Record<string, unknown>, ctx: object | undefined) => {
  await hooks.update!.before!(data as never, ctx as never);
  await hooks.update!.after!(user as never, ctx as never);
};
const owner = { id: "u1", email: ADMIN, emailVerified: true, role: "user" };

describe("admin promotion", () => {
  it("promotes when an update verifies the admin email (link, OAuth account linking, email change)", async () => {
    await update({ emailVerified: true }, owner, {});
    expect(set).toHaveBeenCalledWith({ role: "admin" });
  });

  it("doesn't re-promote on other updates, so a demotion sticks", async () => {
    await update({ role: "user" }, owner, {});
    expect(set).not.toHaveBeenCalled();
  });

  it("doesn't promote another address", async () => {
    await update({ emailVerified: true }, { ...owner, email: "someone@example.test" }, {});
    expect(set).not.toHaveBeenCalled();
  });

  it("promotes an account created already verified (OAuth sign-up)", async () => {
    await hooks.create!.after!(owner as never, {} as never);
    expect(set).toHaveBeenCalledWith({ role: "admin" });
  });
});
