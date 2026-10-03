/** Order is the fact: profile.ts L93, ai-gateway-three-generations.mdx L52-61. GatewayPath draws them in this order. */
export const AI_GATES = ["SSO", "Rate limits", "Guardrails", "Cache", "Routing"] as const;
export const MCP_GATES = ["OAuth", "Registry"] as const;
export const CALLERS = ["Claude Code", "Claude Desktop", "Agents", "End users"] as const;
/** profile.ts L123: tools are reached by Claude Code, Claude Desktop and agents, not by end users. */
export const TOOL_CALLERS = ["Claude Code", "Claude Desktop", "Agents"] as const;
export const MODEL_TARGETS = ["Azure AI Foundry", "Anthropic"] as const;
export const TOOL_TARGET = "MCP servers" as const;
/** profile.ts L93: "checked for personal data, secrets, prompt injection and restricted topics". */
export const GUARDRAIL_CATEGORIES = ["personal data", "secrets", "prompt injection", "restricted topics"] as const;
/** profile.ts L95. Shown verbatim, never restated as a number. */
export const AUDIT_RETENTION = "at least 90 days" as const;

export type AiGate = (typeof AI_GATES)[number];
export type McpGate = (typeof MCP_GATES)[number];
export type Gate = AiGate | McpGate;
export type Caller = (typeof CALLERS)[number];
export type ToolCaller = (typeof TOOL_CALLERS)[number];
export type ModelTarget = (typeof MODEL_TARGETS)[number];
export type Target = ModelTarget | typeof TOOL_TARGET;
export type GuardrailCategory = (typeof GUARDRAIL_CATEGORIES)[number];
