import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { describe, expect, it } from "vitest";
import ThemeToggle from "../src/components/ThemeToggle.astro";

const render = async (props: Record<string, unknown>) =>
  (await AstroContainer.create()).renderToString(ThemeToggle, { props });

describe("ThemeToggle", () => {
  it("marks the current theme and mode as pressed", async () => {
    const html = await render({ theme: "pro", mode: "dark", proPalette: "indigo" });
    expect(html).toMatch(/data-set-theme="pro"[^>]*aria-pressed="true"/);
    expect(html).toMatch(/data-set-theme="brand"[^>]*aria-pressed="false"/);
    expect(html).toMatch(/data-set-mode="dark"[^>]*aria-pressed="true"/);
    expect(html).toMatch(/data-set-mode="system"[^>]*aria-pressed="false"/);
  });

  it("passes the Pro palette to the client script and names it on the button", async () => {
    const html = await render({ theme: "brand", mode: "system", proPalette: "indigo" });
    expect(html).toContain('data-pro-palette="indigo"');
    expect(html).toContain('title="Indigo Circuit"');
  });
});
