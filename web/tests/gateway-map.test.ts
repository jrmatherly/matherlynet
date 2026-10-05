import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { describe, expect, it } from "vitest";
import GatewayMap from "../src/components/GatewayMap.astro";
import GatewayPath from "../src/components/GatewayPath.astro";
import { GENERATIONS, type Generation, type GenerationKey } from "../src/data/gateway-generations";
import { W, layout, name } from "../src/lib/gateway-map";

// Called the way the post calls it: one prop, the generation key.
const render = async (generation: GenerationKey) => (await AstroContainer.create()).renderToString(GatewayMap, { props: { generation } });
const shown = (html: string) => [...html.matchAll(/<tspan[^>]*>([^<]*)<\/tspan>/g)].map((m) => m[1]);
const wires = (html: string) => [...html.matchAll(/<path[^>]*data-to="([^"]*)"[^>]*>/g)];
const dashed = (html: string) => wires(html).filter((m) => m[0].includes("stroke-dasharray")).map((m) => m[1]);
const ids = (html: string) => [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);

describe("GatewayMap", () => {
  it("is an accessible, still figure that scrolls rather than shrinks on phones, with no inline style or script", async () => {
    for (const generation of Object.keys(GENERATIONS) as GenerationKey[]) {
      const html = await render(generation);
      expect(html, generation).toContain('role="img"');
      expect(html, generation).toContain(`aria-labelledby="gateway-${generation}-title gateway-${generation}-desc"`);
      expect(html, generation).toContain(`min-w-[${W}px]`);
      expect(html, generation).toMatch(new RegExp(`viewBox="0 0 ${W} \\d+"`));
      expect(html, generation).not.toMatch(/\sstyle=/);
      expect(html, generation).not.toContain("<script");
      expect(html, generation).not.toContain("<animate");
      expect(html, generation).toContain("Swipe to see the whole map.");
    }
  });

  it("maps generation 1: two client groups, the LiteLLM proxy with Redis and PostgreSQL on-prem, Foundry in Azure", async () => {
    const html = await render("litellm");
    expect(html).toMatch(/<title[^>]*>Generation 1: the LiteLLM proxy<\/title>/);
    const text = shown(html);
    for (const label of ["Claude clients", "Code, Desktop", "OpenAI-compatible", "clients", "agents, internal tools", "LiteLLM proxy", "Redis", "response cache", "PostgreSQL", "virtual keys, spend", "Azure AI Foundry", "On-prem Kubernetes cluster", "Azure subscription"])
      expect(text, label).toContain(label);
    for (const via of ["model call", "caches answers", "keys, spend"]) expect(text, via).toContain(via);
    expect(text.filter((t) => t === "virtual key")).toHaveLength(2);
    expect(wires(html).map((m) => m[1])).toEqual(["Claude clients", "OpenAI-compatible clients", "Azure AI Foundry", "Redis", "PostgreSQL"]);
    expect(dashed(html)).toEqual([]);
  });

  it("maps generation 2: API Management with Entra and Redis beside it and four upstreams, failover dashed", async () => {
    const html = await render("apim");
    expect(html).toMatch(/<title[^>]*>Generation 2: Azure API Management<\/title>/);
    const text = shown(html);
    for (const label of ["Claude clients", "Code, Desktop,", "Cowork", "OpenAI-compatible", "Codex, agents,", "internal tools", "Azure API Management", "single sign-on, rate limits", "Microsoft Entra ID", "validates JWTs", "Azure Managed Redis", "monthly spend counters", "Anthropic", "MCP servers", "Azure AI Foundry", "Usage pipeline", "Event Hub,", "Logic App,", "Cosmos DB"])
      expect(text, label).toContain(label);
    for (const via of ["or API key", "failover", "OAuth shim", "managed identity", "usage events", "validate JWT", "monthly spend"]) expect(text, via).toContain(via);
    expect(text.filter((t) => t === "Entra JWT")).toHaveLength(2);
    // One boundary, labelled once.
    expect(text.filter((t) => t === "Azure subscription")).toHaveLength(1);
    expect(wires(html)).toHaveLength(8);
    expect(dashed(html)).toEqual(["Anthropic"]);
  });

  it("gives each figure in the post its own ids", async () => {
    const all: string[] = ids(await (await AstroContainer.create()).renderToString(GatewayPath));
    for (const generation of Object.keys(GENERATIONS) as GenerationKey[]) {
      const own = ids(await render(generation));
      expect(own.length, generation).toBeGreaterThan(0);
      for (const id of own) expect(id, generation).toMatch(new RegExp(`^gateway-${generation}-`));
      all.push(...own);
    }
    expect(new Set(all).size).toBe(all.length);
  });
});

describe("GENERATIONS", () => {
  it("says in words every box it draws", () => {
    for (const gen of Object.values(GENERATIONS) as Generation<string>[])
      for (const n of [gen.hub, ...gen.callers, ...gen.services, ...gen.upstreams])
        if (n) expect(gen.desc.toLowerCase(), name(n)).toContain(name(n).toLowerCase());
  });
});

describe("layout", () => {
  const litellm: Generation<string> = GENERATIONS.litellm;
  const apim: Generation<string> = GENERATIONS.apim;

  it("refuses a region that would enclose a node outside it", () => {
    const [anthropic, mcp, foundry, usage] = apim.upstreams;
    expect(() => layout({ ...apim, upstreams: [foundry, anthropic, mcp, usage] })).toThrow(/"Azure subscription" would enclose Anthropic/);
  });

  it("refuses a name wider than its box and a wire label that would touch the hub or a region edge", () => {
    expect(() => layout({ ...litellm, callers: [{ ...litellm.callers[0], label: "OpenAI-compatible clients" }] })).toThrow(/"OpenAI-compatible clients" is [\d.]+px, wider than its 110px box/);
    expect(() => layout({ ...litellm, callers: [{ ...litellm.callers[0], via: "a much longer credential" }] })).toThrow(/"a much longer credential" (touches|crosses)/);
  });

  it("draws nothing for a region with no members", () => {
    expect(layout({ ...litellm, regions: { ...litellm.regions, spare: "Spare" } }).regions).toHaveLength(2);
  });
});
