// Site identity used by SEO tags, JSON-LD, the sitemap and robots.txt.

// The public origin comes from Aspire's app-url parameter at run time (it also drives OAuth callbacks).
export const siteOrigin = (): URL => new URL(process.env.BETTER_AUTH_URL ?? "http://localhost:4321");

export const person = {
  name: "Jason Matherly",
  jobTitle: "AI Platform & Infrastructure Leader",
  description:
    "AI platform and infrastructure leader in Atlanta: AI and MCP gateways, Kubernetes, and enterprise infrastructure.",
  locality: "Atlanta, GA",
  worksFor: "The Aaron's Company",
  // Read by search engines and sourcing tools (JSON-LD), not shown on the page.
  knowsAbout: ["AI platform engineering", "AI gateways", "Model Context Protocol", "Retrieval-augmented generation", "Agentic AI", "LLMOps", "AI governance", "Responsible AI", "AI cost management", "AI enablement", "Platform engineering", "Kubernetes", "Enterprise infrastructure", "Data centers", "SD-WAN"],
  // No GitHub: its public repos are archived and don't represent current work.
  sameAs: ["https://www.linkedin.com/in/jason-matherly"],
} as const;

// Public, indexable routes: the header nav, footer, 404 page and sitemap read this list.
export const publicRoutes: { path: string; label: string; nav: boolean }[] = [
  { path: "/", label: "Home", nav: false },
  { path: "/work", label: "Work", nav: true },
  { path: "/changelog", label: "Changelog", nav: true },
  { path: "/playground", label: "Playground", nav: true },
  { path: "/writing", label: "Writing", nav: true },
  { path: "/about", label: "About", nav: true },
];
