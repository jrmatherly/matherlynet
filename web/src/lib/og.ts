import { BRAND_PALETTE, type SiteThemeDefaults } from "../theme/palettes";

// Share cards served by /og/[slug].png. Pages reference them with ogImage(slug).
export const ogCards: Record<string, { title: string; subtitle: string }> = {
  home: {
    title: "I build the platforms enterprise AI runs on.",
    subtitle: "AI platform & infrastructure leader · Atlanta, GA",
  },
  work: { title: "Platforms that run in production, not in slides.", subtitle: "AI gateways, MCP, Kubernetes and enterprise infrastructure" },
  about: { title: "Seventeen years, one company, three promotions.", subtitle: "From store networks to company-wide AI strategy" },
  writing: { title: "Writing", subtitle: "Notes on AI platforms, governance and infrastructure" },
  changelog: { title: "Seventeen years, one company, newest first.", subtitle: "Roles, platforms and what each one changed" },
};

type CardSite = Pick<SiteThemeDefaults, "theme" | "proPalette">;

// The palette a share card renders in: Signal for a Brand site, otherwise the Pro palette set on /admin.
export const cardPalette = (site: CardSite) => (site.theme === "brand" ? BRAND_PALETTE : site.proPalette);

// The version parameter makes social caches refetch when an admin changes the theme or palette.
export const ogImage = (slug: keyof typeof ogCards & string, site: CardSite) => `/og/${slug}.png?v=${cardPalette(site)}`;
