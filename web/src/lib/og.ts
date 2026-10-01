import { SITE_DEFAULTS } from "../theme/palettes";

// Share cards served by /og/[slug].png. Pages reference them with ogImage(slug).
export const ogCards: Record<string, { title: string; subtitle: string }> = {
  home: {
    title: "I build the platforms enterprise AI runs on.",
    subtitle: "AI platform & infrastructure leader · Atlanta, GA",
  },
};

// Cards use the site's default Pro palette; the version parameter makes social caches refetch
// when an admin changes it.
export const ogImage = (slug: keyof typeof ogCards & string) => `/og/${slug}.png?v=${SITE_DEFAULTS.proPalette}`;
