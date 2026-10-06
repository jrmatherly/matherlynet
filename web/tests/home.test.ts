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
  // The two drawings, wide then stacked. Astro's dev annotations carry an absolute path and a line number, neither of
  // which is part of a drawing.
  const svgs = (html: string) => (html.match(/<svg[\s\S]*?<\/svg>/g) ?? []).map((svg) => svg.replace(/ data-astro-source-(?:file|loc)="[^"]*"/g, ""));
  // A two-line name renders as tspans; read it as one label.
  const joined = (svg: string) => svg.replace(/<\/tspan><tspan[^>]*>/g, " ").replace(/<\/?tspan[^>]*>/g, "");
  const ids = (svg: string) => [...svg.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);

  // The wide drawing as rendered before the stacked one existed, SMIL timings included.
  it("draws the wide figure exactly as before", async () => {
    const [wide] = svgs(await render(GatewayPath));
    expect(wide).toBeDefined();
    await expect(wide).toMatchFileSnapshot("./__snapshots__/gateway-path-wide.svg");
  });

  it("shows one accessible drawing per side of the sm breakpoint, with nothing to scroll", async () => {
    const html = await render(GatewayPath);
    const [wide, stacked, ...more] = svgs(html);
    expect(more).toEqual([]);
    expect(html).toMatch(/<div class="hidden sm:block"[^>]*>\s*<svg viewBox="0 0 520 308"/);
    expect(html).toMatch(/<div class="sm:hidden"[^>]*>\s*<svg viewBox="0 0 240 /);
    expect(+stacked.match(/viewBox="0 0 (\d+) \d+"/)![1]).toBeLessThanOrEqual(246);
    expect(ids(wide)).toEqual(["path-title", "path-desc", "path-glow"]);
    expect(ids(stacked)).toEqual(["path-stacked-title", "path-stacked-desc", "path-stacked-glow"]);
    for (const svg of [wide, stacked]) {
      expect(svg).toContain('role="img"');
      expect(svg).toMatch(/<title[^>]*>How a request moves through the AI Gateway<\/title>/);
      // Everything that moves sits in the one reduced-motion group, so the drawing above it is complete without it.
      expect(svg.match(/motion-reduce:hidden/g)).toHaveLength(1);
      expect(svg.indexOf("<animate")).toBeGreaterThan(svg.indexOf("motion-reduce:hidden"));
    }
    expect(html).not.toContain("tabindex=");
    expect(html).not.toContain("Swipe");
  });

  it("shows the real callers, each gateway's checks in order, and where requests go, in both drawings", async () => {
    for (const svg of svgs(await render(GatewayPath)).map(joined)) {
      for (const label of ["Claude Code", "Claude Desktop", "Agents", "End users", "Azure AI Foundry", "Anthropic", "MCP servers", "Audit log", "AI Gateway", "MCP Gateway"])
        expect(svg, label).toContain(`>${label}</text>`);
      const checks = ["SSO", "Rate limits", "Guardrails", "Cache", "Routing", "OAuth", "Registry"].map((check) => svg.indexOf(`>${check}</text>`));
      expect(checks.every((at) => at > -1)).toBe(true);
      expect(checks).toEqual([...checks].sort((a, b) => a - b));
    }
  });

  it("keeps several requests in motion, refuses one at the guardrails and answers one from the cache, in both drawings", async () => {
    const html = await render(GatewayPath);
    for (const svg of svgs(html)) {
      // Five requests reach a model; one stops at the guardrails and one turns back at the cache.
      expect(svg.match(/data-pulse="passed"/g)).toHaveLength(5);
      expect(svg.match(/data-pulse="refused"/g)).toHaveLength(1);
      expect(svg.match(/data-pulse="cached"/g)).toHaveLength(1);
      // Tool calls take the MCP Gateway's lane.
      expect(svg.match(/data-pulse="tool"/g)).toHaveLength(3);
    }
    // SMIL needs keyTimes that start at 0, end at 1 and never go backwards, or the browser drops the animation.
    for (const [, list] of html.matchAll(/keyTimes="([^"]+)"/g)) {
      const times = list.split(";").map(Number);
      expect(times[0]).toBe(0);
      expect(times.at(-1)).toBe(1);
      expect(times).toEqual([...times].sort((a, b) => a - b));
    }
  });
});
