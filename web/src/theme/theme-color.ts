// <meta name="theme-color"> tags for the browser chrome. Shared by Base.astro and Seo.astro (server render) and
// the theme controls' script (re-sync after a visitor switches mode or theme).

// A forced mode is one color; "system" is a light/dark pair the browser picks between.
export type ThemeColor = string | { light: string; dark: string };

// A forced mode gets that side's background; "system" leaves the choice to the browser's own media query.
// (Two media-queried tags under a forced mode would follow the OS, not the page: light chrome on a dark page.)
export const themeColorFor = (mode: string | undefined, bg: (side: "light" | "dark") => string): ThemeColor =>
  mode === "light" || mode === "dark" ? bg(mode) : { light: bg("light"), dark: bg("dark") };

export const themeColorTags = (color: ThemeColor): { media?: string; content: string }[] =>
  typeof color === "string"
    ? [{ content: color }]
    : [
        { media: "(prefers-color-scheme: light)", content: color.light },
        { media: "(prefers-color-scheme: dark)", content: color.dark },
      ];
