import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { describe, expect, it } from "vitest";
import ModeToggle from "../src/components/ModeToggle.astro";
import ThemeControls from "../src/components/ThemeControls.astro";

const render = async (Component: Parameters<AstroContainer["renderToString"]>[0], props: Record<string, unknown>) =>
  (await AstroContainer.create()).renderToString(Component, { props });

describe("ModeToggle", () => {
  it("marks the current mode as pressed", async () => {
    const html = await render(ModeToggle, { mode: "dark" });
    expect(html).toMatch(/data-set-mode="dark"[^>]*aria-pressed="true"/);
    expect(html).toMatch(/data-set-mode="system"[^>]*aria-pressed="false"/);
  });
});

describe("ThemeControls", () => {
  it("marks the current theme and typeface as pressed and names the Pro palette", async () => {
    const html = await render(ThemeControls, { theme: "pro", typeface: "serif", proPalette: "paper" });
    expect(html).toMatch(/data-set-theme="pro"[^>]*aria-pressed="true"/);
    expect(html).toMatch(/data-set-type="serif"[^>]*aria-pressed="true"/);
    expect(html).toMatch(/data-set-type="sans"[^>]*aria-pressed="false"/);
    expect(html).toContain('data-pro-palette="paper"');
    // Astro escapes attribute values: "&" renders as "&amp;".
    expect(html).toContain('title="Paper &amp; Evergreen"');
  });
});
