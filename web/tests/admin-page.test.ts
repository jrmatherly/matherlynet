import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SiteSettings } from "../src/lib/settings-form";
import NotFound from "../src/pages/404.astro";
import Admin from "../src/pages/admin.astro";
import { SITE_DEFAULTS, resolveTheme } from "../src/theme/palettes";

const { readSiteSettings, saveSiteSettings } = vi.hoisted(() => ({
  readSiteSettings: vi.fn<() => Promise<SiteSettings>>(),
  saveSiteSettings: vi.fn<(settings: SiteSettings) => Promise<void>>(),
}));
vi.mock("../src/lib/site-settings", async (orig) => ({ ...(await orig<object>()), readSiteSettings, saveSiteSettings }));

const row: SiteSettings = {
  theme: "pro",
  proPalette: "merlot",
  typeface: "serif",
  sentry: { dsn: null, server: false, browser: false },
  umami: { enabled: false, scriptUrl: null, websiteId: null },
};
// The page reads only user.role; the rest of better-auth's user shape is not rendered.
const locals = (role: string | null): App.Locals => ({
  user: role ? ({ role } as App.Locals["user"]) : null,
  session: null,
  siteSettings: { ...SITE_DEFAULTS, sentry: row.sentry, umami: row.umami },
  theme: resolveTheme({}),
});

async function render(role: string | null, init?: RequestInit) {
  const container = await AstroContainer.create();
  container.insertPageRoute("/404", NotFound);
  return container.renderToResponse(Admin, { locals: locals(role), request: new Request("http://localhost/admin", init), routeType: "page" });
}

const form = (fields: Record<string, string>) => {
  const body = new FormData();
  for (const [name, value] of Object.entries(fields)) body.set(name, value);
  return { method: "POST", body };
};

beforeEach(() => {
  readSiteSettings.mockReset().mockResolvedValue(row);
  saveSiteSettings.mockReset().mockResolvedValue();
});

describe("/admin", () => {
  it("renders the form from the stored row for an admin", async () => {
    const res = await render("admin");
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toMatch(/name="theme" value="pro"[^>]*checked/);
    expect(html).toMatch(/<option value="merlot"[^>]*selected/);
    expect(html).toMatch(/name="typeface" value="serif"[^>]*checked/);
    expect(saveSiteSettings).not.toHaveBeenCalled();
  });

  // A form filled from defaults would save them over the real row on the next submit.
  it("fails rather than render a form when the row can't be read", async () => {
    readSiteSettings.mockRejectedValue(new Error("database down"));
    await expect(render("admin")).rejects.toThrow("database down");
    expect(saveSiteSettings).not.toHaveBeenCalled();
  });

  it("answers an invalid POST with the error and saves nothing", async () => {
    const res = await render("admin", form({ theme: "pro", proPalette: "neon", typeface: "sans" }));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('role="alert"');
    expect(saveSiteSettings).not.toHaveBeenCalled();
  });

  it("saves a valid POST once and redirects to /admin?saved", async () => {
    const res = await render("admin", form({ theme: "brand", proPalette: "cobalt", typeface: "sans" }));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/admin?saved");
    expect(saveSiteSettings).toHaveBeenCalledTimes(1);
    expect(saveSiteSettings.mock.calls[0][0]).toMatchObject({ theme: "brand", proPalette: "cobalt", typeface: "sans" });
  });

  it.each([null, "user"])("answers 404 to a visitor with role %j", async (role) => {
    const res = await render(role);
    expect(res.status).toBe(404);
    expect(await res.text()).toContain("That page doesn");
    expect(readSiteSettings).not.toHaveBeenCalled();
  });
});
