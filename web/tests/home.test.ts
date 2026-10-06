import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { describe, expect, it } from "vitest";
import Availability from "../src/components/Availability.astro";
import GatewayPath from "../src/components/GatewayPath.astro";
import { figureNode } from "../src/lib/form";

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

  // Each whole SVG, SMIL timings included; update a file only for an intended change to that figure.
  it("pins the wide SVG", async () => {
    const [wide] = svgs(await render(GatewayPath));
    expect(wide).toBeDefined();
    await expect(wide).toMatchFileSnapshot("./__snapshots__/gateway-path-wide.svg");
  });
  it("pins the stacked SVG", async () => {
    const [, stacked] = svgs(await render(GatewayPath));
    expect(stacked).toBeDefined();
    await expect(stacked).toMatchFileSnapshot("./__snapshots__/gateway-path-stacked.svg");
  });

  it("shows one accessible drawing per side of the sm breakpoint, with nothing to scroll", async () => {
    const html = await render(GatewayPath);
    const [wide, stacked, ...more] = svgs(html);
    expect(more).toEqual([]);
    expect(html).toMatch(/<div class="hidden sm:block"[^>]*>\s*<svg viewBox="0 0 520 308"/);
    expect(html).toMatch(/<div class="sm:hidden"[^>]*>\s*<svg viewBox="0 0 240 /);
    expect(ids(wide)).toEqual(["path-title", "path-desc", "path-glow"]);
    expect(ids(stacked)).toEqual(["path-stacked-title", "path-stacked-desc", "path-stacked-glow"]);
    for (const svg of [wide, stacked]) {
      expect(svg).toContain('role="img"');
      expect(svg).toMatch(/<title[^>]*>How a request moves through the AI Gateway<\/title>/);
      // Everything that moves sits in the one reduced-motion group, so the drawing above it is complete without it.
      expect(svg.match(/motion-reduce:hidden/g)).toHaveLength(1);
      expect(svg.indexOf("<animate")).toBeGreaterThan(svg.indexOf("motion-reduce:hidden"));
      const moving = svg.slice(svg.indexOf("motion-reduce:hidden"));
      expect(moving).not.toContain("<text");
      expect(moving).not.toContain(figureNode);
    }
    expect(html).not.toContain("tabindex=");
    expect(html).not.toContain("Swipe");
  });

  it("shows the real callers, each gateway's checks in order, and where requests go, in both drawings", async () => {
    const drawings = svgs(await render(GatewayPath));
    expect(drawings).toHaveLength(2);
    for (const svg of drawings.map(joined)) {
      for (const label of ["Claude Code", "Claude Desktop", "Agents", "End users", "Azure AI Foundry", "Anthropic", "MCP servers", "Audit log", "AI Gateway", "MCP Gateway"])
        expect(svg, label).toContain(`>${label}</text>`);
      const checks = ["SSO", "Rate limits", "Guardrails", "Cache", "Routing", "OAuth", "Registry"].map((check) => svg.indexOf(`>${check}</text>`));
      expect(checks.every((at) => at > -1)).toBe(true);
      expect(checks).toEqual([...checks].sort((a, b) => a - b));
    }
  });

  it("keeps several requests in motion, refuses one at the guardrails and answers one from the cache, in both drawings", async () => {
    const html = await render(GatewayPath);
    expect(svgs(html)).toHaveLength(2);
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

  it("gives every animation as many values or keyPoints as keyTimes, in both drawings", async () => {
    const drawings = svgs(await render(GatewayPath));
    expect(drawings).toHaveLength(2);
    for (const svg of drawings) {
      const animations = [...svg.matchAll(/<(animate|animateMotion) ([^>]*)>/g)];
      // 4 callers, 3 targets and 7 checks flash; each of 10 requests has 3 dots (a motion and a show each) and a mark; the cross and the tick.
      expect(animations.filter(([, tag]) => tag === "animate")).toHaveLength(56);
      expect(animations.filter(([, tag]) => tag === "animateMotion")).toHaveLength(30);
      for (const [, tag, attrs] of animations) {
        const count = (name: string) => {
          const list = attrs.match(new RegExp(` ${name}="([^"]*)"`))?.[1];
          if (list === undefined) throw new Error(`no ${name} in <${tag} ${attrs}>`);
          return list.split(";").length;
        };
        expect(count(tag === "animate" ? "values" : "keyPoints"), attrs).toBe(count("keyTimes"));
      }
    }
  });
});
