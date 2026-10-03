import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { describe, expect, it } from "vitest";
import Logo from "../src/components/Logo.astro";

const render = async (props: Record<string, unknown>) => (await AstroContainer.create()).renderToString(Logo, { props });

describe("Logo", () => {
  it("shows only the vector monogram at header size, in every theme", async () => {
    const html = await render({});
    expect(html).not.toContain("m-logo.png");
    expect(html).toContain("<svg");
    expect(html).not.toContain("logo-pro");
  });

  it("is named for assistive tech unless it sits beside the name already", async () => {
    expect(await render({})).toContain('aria-label="Matherly"');
    const decorative = await render({ decorative: true });
    expect(decorative).toContain('aria-hidden="true"');
    expect(decorative).not.toContain("aria-label");
  });

  it("keeps the brand raster beside the monogram at larger sizes (CSS picks one per theme)", async () => {
    const html = await render({ size: "size-24" });
    expect(html).toContain("m-logo.png");
    expect(html).toContain("logo-pro");
  });
});
