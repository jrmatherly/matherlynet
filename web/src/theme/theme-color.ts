// <meta name="theme-color"> tags for the browser chrome. Shared by Seo.astro (server render) and the theme
// controls' script (re-sync after a visitor switches mode or theme).

// A forced mode is one colour; "system" is a light/dark pair the browser picks between.
export type ThemeColor = string | { light: string; dark: string };

export const themeColorTags = (color: ThemeColor): { media?: string; content: string }[] =>
  typeof color === "string"
    ? [{ content: color }]
    : [
        { media: "(prefers-color-scheme: light)", content: color.light },
        { media: "(prefers-color-scheme: dark)", content: color.dark },
      ];
