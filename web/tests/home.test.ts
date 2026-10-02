import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { describe, expect, it } from "vitest";
import Availability from "../src/components/Availability.astro";
import GatewayPath from "../src/components/GatewayPath.astro";

const render = async (Component: Parameters<AstroContainer["renderToString"]>[0], props: Record<string, unknown> = {}) =>
  (await AstroContainer.create()).renderToString(Component, { props });

describe("Availability", () => {
  it("renders nothing when there is no wording", async () => {
    expect((await render(Availability, { text: null })).trim()).toBe("");
  });
  it("renders the line when wording is set", async () => {
    expect(await render(Availability, { text: "Open to platform leadership roles." })).toContain("Open to platform leadership roles.");
  });
});

describe("GatewayPath", () => {
  it("is an accessible figure that scrolls rather than shrinks on phones", async () => {
    const html = await render(GatewayPath);
    expect(html).toContain('role="img"');
    expect(html).toMatch(/<title[^>]*>How a request moves through the AI Gateway<\/title>/);
    expect(html).toContain("min-w-[520px]");
    expect(html).toContain("motion-reduce:hidden");
  });
});
