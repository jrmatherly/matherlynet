import { beforeEach, describe, expect, it, vi } from "vitest";

const select = vi.fn();
vi.mock("../src/db", () => ({ db: { select: () => ({ from: () => ({ limit: select }) }) } }));
vi.mock("../src/lib/sentry", () => ({ configureSentry: vi.fn() }));

describe("getSiteSettings", () => {
  beforeEach(() => {
    vi.resetModules();
    select.mockReset();
    vi.useRealTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("falls back to built-in defaults when the first query fails", async () => {
    select.mockRejectedValue(new Error("ECONNREFUSED"));
    const { getSiteSettings } = await import("../src/lib/site-settings");
    await expect(getSiteSettings()).resolves.toMatchObject({ theme: "brand", sentry: { server: false } });
  });

  it("keeps serving the last settings when a refresh fails", async () => {
    vi.useFakeTimers();
    select.mockResolvedValueOnce([{ theme: "pro", proPalette: "merlot" }]).mockRejectedValue(new Error("down"));
    const { getSiteSettings } = await import("../src/lib/site-settings");
    await getSiteSettings();
    vi.advanceTimersByTime(31_000);
    await expect(getSiteSettings()).resolves.toMatchObject({ theme: "pro", proPalette: "merlot" });
  });
});
