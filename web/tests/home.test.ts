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
  // The wide drawing as rendered today, SMIL timings included. A layout change for phones must leave it untouched.
  it("draws the wide figure exactly as before", async () => {
    const html = await render(GatewayPath);
    // Astro's dev annotations carry an absolute path and a line number, neither of which is part of the drawing.
    const svg = html.match(/<svg[\s\S]*?<\/svg>/)?.[0]?.replace(/ data-astro-source-(?:file|loc)="[^"]*"/g, "");
    expect(svg).toBeDefined();
    await expect(svg).toMatchFileSnapshot("./__snapshots__/gateway-path-wide.svg");
  });

  it("is an accessible figure that scrolls rather than shrinks on phones", async () => {
    const html = await render(GatewayPath);
    expect(html).toContain('role="img"');
    expect(html).toMatch(/<title[^>]*>How a request moves through the AI Gateway<\/title>/);
    expect(html).toContain("min-w-[520px]");
    expect(html).toContain("motion-reduce:hidden");
  });

  it("shows the real callers, each gateway's checks in order, and where requests go", async () => {
    const html = await render(GatewayPath);
    for (const label of ["Claude Code", "Claude Desktop", "Agents", "End users", "Azure AI Foundry", "Anthropic", "MCP servers", "Audit log", "MCP Gateway"])
      expect(html, label).toContain(`>${label}</text>`);
    const checks = ["SSO", "Rate limits", "Guardrails", "Cache", "Routing", "OAuth", "Registry"].map((check) => html.indexOf(`>${check}</text>`));
    expect(checks.every((at) => at > -1)).toBe(true);
    expect(checks).toEqual([...checks].sort((a, b) => a - b));
  });

  it("keeps several requests in motion, refuses one at the guardrails and answers one from the cache", async () => {
    const html = await render(GatewayPath);
    // Five requests reach a model; one stops at the guardrails and one turns back at the cache.
    expect(html.match(/data-pulse="passed"/g)).toHaveLength(5);
    expect(html.match(/data-pulse="refused"/g)).toHaveLength(1);
    expect(html.match(/data-pulse="cached"/g)).toHaveLength(1);
    // Tool calls take the MCP Gateway's lane.
    expect(html.match(/data-pulse="tool"/g)).toHaveLength(3);
    // SMIL needs keyTimes that start at 0, end at 1 and never go backwards, or the browser drops the animation.
    for (const [, list] of html.matchAll(/keyTimes="([^"]+)"/g)) {
      const times = list.split(";").map(Number);
      expect(times[0]).toBe(0);
      expect(times.at(-1)).toBe(1);
      expect(times).toEqual([...times].sort((a, b) => a - b));
    }
  });
});
