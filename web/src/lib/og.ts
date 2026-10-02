import { headline } from "../data/profile";
import { BRAND_PALETTE, type SiteThemeDefaults } from "../theme/palettes";

// Share cards served by /og/[slug].png. Pages reference them with ogImage(slug, site).
export const ogCards = {
  home: {
    // The card font has no non-breaking hyphen glyph (the page uses one to keep "15,000-person" together).
    title: headline.replaceAll("‑", "-"),
    subtitle: "AI platform & infrastructure leader · Atlanta, GA",
  },
  work: { title: "Platforms that run in production, not in slides.", subtitle: "AI gateways, MCP, Kubernetes and enterprise infrastructure" },
  about: { title: "Twenty years, one company, four promotions.", subtitle: "From the IT call center to company-wide AI strategy" },
  writing: { title: "Writing", subtitle: "Notes on AI platforms, governance and infrastructure" },
  changelog: { title: "Twenty years, one company, newest first.", subtitle: "Roles, platforms and what each one changed" },
} satisfies Record<string, { title: string; subtitle: string }>;

type CardSite = Pick<SiteThemeDefaults, "theme" | "proPalette">;

// The palette a share card renders in: Signal for a Brand site, otherwise the Pro palette set on /admin.
export const cardPalette = (site: CardSite) => (site.theme === "brand" ? BRAND_PALETTE : site.proPalette);

// The version parameter makes social caches refetch when an admin changes the theme or palette, and tells the
// route which palette to render.
export const ogImage = (slug: keyof typeof ogCards, site: CardSite) => `/og/${slug}.png?v=${cardPalette(site)}`;
