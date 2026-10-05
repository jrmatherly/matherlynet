import { MODEL_TARGETS, TOOL_TARGET } from "./gateway";

/**
 * The retired gateway generations, as GatewayMap.astro draws them (geometry in ../lib/gateway-map.ts). Names shared
 * with the generation 3 figure come from ./gateway so the three figures spell them the same way.
 *
 * Every wire in these generations touches the gateway, so a wire is a field on the node it reaches and there is no
 * `from`/`to` to point at a node that doesn't exist. A region is a field on each node that lives in it; the one
 * cross-reference left (a node's region key) is checked by the compiler through `generation()`.
 */

/** One line, or the lines a long name wraps to. layout() throws if a line is wider than its box. */
export type Lines = string | readonly [string, ...string[]];

/** A box on the map. */
export interface Node<R extends string> {
  /** The name, 12px (13px bold on the hub). */
  readonly label: Lines;
  /** What it held or did, 11px muted, under the name. */
  readonly note?: Lines;
  /** The boundary it sits inside. Absent: outside every boundary on the map. */
  readonly region?: NoInfer<R>;
}

/** A node wired to the hub. */
export interface Party<R extends string> extends Node<R> {
  /** The credential, mechanism or purpose on the wire, 11px muted beside it. */
  readonly via: Lines;
  /** Drawn dashed: a path taken only when the primary fails. */
  readonly failover?: true;
}

export interface Generation<R extends string> {
  /** The SVG `<title>`. */
  readonly title: string;
  /** The SVG `<desc>`: the whole picture in words, naming every node. */
  readonly desc: string;
  /** Boundary key to its label. Keys are what `region` fields may name. */
  readonly regions: Readonly<Record<R, string>>;
  /** The gateway. Every wire on the map touches it. */
  readonly hub: Node<R>;
  /** West column, top to bottom. Arrows point into the hub. */
  readonly callers: readonly Party<R>[];
  /** The hub's own dependencies, beside it: the first above, the second below. The map has room for two. */
  readonly services: readonly [Party<R>?, Party<R>?];
  /** East column, top to bottom. Arrows point out of the hub. */
  readonly upstreams: readonly Party<R>[];
}

/** Infers the region keys from `regions` alone (NoInfer on the nodes), so `region: "azur"` is a compile error. */
const generation = <R extends string>(g: Generation<R>) => g;

export const GENERATIONS = {
  litellm: generation({
    title: "Generation 1: the LiteLLM proxy",
    desc:
      "Claude clients (Claude Code and Claude Desktop) and OpenAI-compatible clients such as agents and internal " +
      "tools called the LiteLLM proxy directly with LiteLLM virtual keys. The proxy ran in the on-prem Kubernetes " +
      "cluster, with Redis caching its answers and PostgreSQL holding the virtual keys and spend, and sent model calls " +
      "to Azure AI Foundry in the Azure subscription.",
    regions: { onprem: "On-prem Kubernetes cluster", azure: "Azure subscription" },
    hub: { label: "LiteLLM proxy", region: "onprem" },
    callers: [
      { label: "Claude clients", note: "Code, Desktop", via: "virtual key" },
      { label: ["OpenAI-compatible", "clients"], note: "agents, internal tools", via: "virtual key" },
    ],
    services: [
      { label: "Redis", note: "response cache", region: "onprem", via: "caches answers" },
      { label: "PostgreSQL", note: "virtual keys, spend", region: "onprem", via: "keys, spend" },
    ],
    upstreams: [{ label: MODEL_TARGETS[0], region: "azure", via: "model call" }],
  }),
  apim: generation({
    title: "Generation 2: Azure API Management",
    desc:
      "Claude clients (Claude Code, Claude Desktop and Cowork), with an Entra JWT or an API key, and OpenAI-compatible " +
      "clients such as Codex, agents and internal tools, with an Entra JWT, called Azure API Management directly. It " +
      "validated the JWTs with Microsoft Entra ID, kept each person's monthly spend counter in Azure Managed Redis, " +
      "called Azure AI Foundry with a managed identity, sent usage events to the usage pipeline (Event Hub, a Logic " +
      "App and Cosmos DB), fronted MCP servers through an OAuth shim, and failed over to Anthropic. API Management, " +
      "Redis, Foundry and the usage pipeline ran in the Azure subscription.",
    regions: { azure: "Azure subscription" },
    hub: { label: "Azure API Management", note: "single sign-on, rate limits", region: "azure" },
    callers: [
      { label: "Claude clients", note: ["Code, Desktop,", "Cowork"], via: ["Entra JWT", "or API key"] },
      { label: ["OpenAI-compatible", "clients"], note: ["Codex, agents,", "internal tools"], via: "Entra JWT" },
    ],
    services: [
      { label: "Microsoft Entra ID", note: "validates JWTs", via: "validate JWT" },
      { label: "Azure Managed Redis", note: "monthly spend counters", region: "azure", via: "monthly spend" },
    ],
    // The two outside the subscription come first, so the region's band in this column is one block: layout() throws
    // if a band would enclose a non-member.
    upstreams: [
      { label: MODEL_TARGETS[1], via: "failover", failover: true },
      { label: TOOL_TARGET, via: "OAuth shim" },
      { label: MODEL_TARGETS[0], region: "azure", via: "managed identity" },
      {
        label: "Usage pipeline",
        note: ["Event Hub,", "Logic App,", "Cosmos DB"],
        region: "azure",
        via: "usage events",
      },
    ],
  }),
} as const;

export type GenerationKey = keyof typeof GENERATIONS;
