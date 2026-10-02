import { beforeEach, describe, expect, it, vi } from "vitest";

const select = vi.fn();
const upsert = vi.fn<(conflict: { set: object }) => Promise<void>>(async () => {});
const values = vi.fn<(row: object) => object>(() => ({ onConflictDoUpdate: upsert }));
vi.mock("../src/db", () => ({
  db: {
    select: () => ({ from: () => ({ limit: select }) }),
    insert: () => ({ values }),
  },
}));
const captureError = vi.fn();
vi.mock("../src/lib/sentry", () => ({ configureSentry: vi.fn(), captureError }));

describe("getSiteSettings", () => {
  beforeEach(() => {
    vi.resetModules();
    select.mockReset();
    captureError.mockReset();
    vi.useRealTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("falls back to built-in defaults when the first query fails, and reports the failure", async () => {
    const down = new Error("ECONNREFUSED");
    select.mockRejectedValue(down);
    const { getSiteSettings } = await import("../src/lib/site-settings");
    await expect(getSiteSettings()).resolves.toMatchObject({ theme: "brand", sentry: { server: false } });
    expect(captureError).toHaveBeenCalledWith(down);
  });

  it("the /admin form's read throws instead of falling back, so defaults can't be saved over the real row", async () => {
    select.mockRejectedValue(new Error("ECONNREFUSED"));
    const { readSiteSettings } = await import("../src/lib/site-settings");
    await expect(readSiteSettings()).rejects.toThrow("ECONNREFUSED");
  });

  it("reads and saves the display typeface", async () => {
    select.mockResolvedValue([{ theme: "pro", proPalette: "merlot", typeface: "serif" }]);
    const { getSiteSettings, saveSiteSettings } = await import("../src/lib/site-settings");
    const settings = await getSiteSettings();
    expect(settings.typeface).toBe("serif");
    await saveSiteSettings(settings);
    expect(values.mock.lastCall?.[0]).toMatchObject({ typeface: "serif" });
    expect(upsert.mock.lastCall?.[0].set).toMatchObject({ typeface: "serif" });
  });

  it("falls back to sans when the stored typeface is unknown", async () => {
    select.mockResolvedValue([{ theme: "pro", proPalette: "merlot", typeface: "gothic" }]);
    const { getSiteSettings } = await import("../src/lib/site-settings");
    await expect(getSiteSettings()).resolves.toMatchObject({ typeface: "sans" });
  });

  it("keeps serving the last settings when a refresh fails", async () => {
    vi.useFakeTimers();
    select.mockResolvedValueOnce([{ theme: "pro", proPalette: "merlot" }]).mockRejectedValue(new Error("down"));
    const { getSiteSettings } = await import("../src/lib/site-settings");
    await getSiteSettings();
    vi.advanceTimersByTime(31_000);
    await expect(getSiteSettings()).resolves.toMatchObject({ theme: "pro", proPalette: "merlot" });
  });

  it("answers from the cache while a refresh is still waiting on the database", async () => {
    vi.useFakeTimers();
    // First load succeeds; every later query hangs, like a connect stuck until its timeout.
    select.mockResolvedValueOnce([{ theme: "pro", proPalette: "merlot" }]).mockReturnValue(new Promise(() => {}));
    const { getSiteSettings } = await import("../src/lib/site-settings");
    await getSiteSettings();
    vi.advanceTimersByTime(31_000);
    const settled = vi.fn();
    getSiteSettings().then(settled);
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toHaveBeenCalledWith(expect.objectContaining({ theme: "pro" }));
  });

  it("retries a failed load after 5 s, not on every request", async () => {
    vi.useFakeTimers();
    select.mockRejectedValue(new Error("down"));
    const { getSiteSettings } = await import("../src/lib/site-settings");
    await getSiteSettings();
    for (let i = 0; i < 3; i++) await getSiteSettings();
    expect(select).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(5_001);
    await getSiteSettings();
    await vi.advanceTimersByTimeAsync(0);
    expect(select).toHaveBeenCalledTimes(2);
  });

  it("a refresh that read the old row before a save doesn't overwrite the saved settings", async () => {
    vi.useFakeTimers();
    let finishRefresh: (rows: object[]) => void = () => {};
    select
      .mockResolvedValueOnce([{ theme: "brand" }])
      .mockReturnValueOnce(new Promise((resolve) => (finishRefresh = resolve)));
    const { getSiteSettings, saveSiteSettings } = await import("../src/lib/site-settings");
    const old = await getSiteSettings();
    vi.advanceTimersByTime(31_000);
    await getSiteSettings(); // starts a background refresh, still waiting on the database
    await saveSiteSettings({ ...old, theme: "pro" }); // an admin saves meanwhile
    finishRefresh([{ theme: "brand" }]); // the refresh's SELECT ran before the save
    await vi.advanceTimersByTimeAsync(0);
    await expect(getSiteSettings()).resolves.toMatchObject({ theme: "pro" });
  });
});
