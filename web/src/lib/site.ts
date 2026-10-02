// Site identity used by SEO tags, JSON-LD, the sitemap and robots.txt.

// The public origin comes from Aspire's app-url parameter at run time (it also drives OAuth callbacks).
export const siteOrigin = (): URL => new URL(process.env.BETTER_AUTH_URL ?? "http://localhost:4321");

export const person = {
  name: "Jason Matherly",
  jobTitle: "AI Platform & Infrastructure Leader",
  description:
    "AI platform and infrastructure leader in Atlanta: AI and MCP gateways, Kubernetes, and enterprise infrastructure.",
  locality: "Atlanta, GA",
  sameAs: ["https://www.linkedin.com/in/jason-matherly", "https://github.com/jrmatherly"],
} as const;

// Public, indexable routes: the header nav and sitemap both read this list.
export const publicRoutes: { path: string; label: string; nav: boolean }[] = [
  { path: "/", label: "Home", nav: false },
  { path: "/work", label: "Work", nav: true },
  { path: "/changelog", label: "Changelog", nav: true },
  // Hidden from the nav until the first post is published (the page, feed and sitemap stay live).
  { path: "/writing", label: "Writing", nav: false },
  { path: "/about", label: "About", nav: true },
];
