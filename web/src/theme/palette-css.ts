// Parses one palette's colors out of palettes.css text. No imports, so plain Node scripts can use it
// (scripts/social-preview.mts) as well as the app (colors.ts).

export type Side = "light" | "dark";

export function colorsFromCss(css: string, palette: string, side: Side): Record<string, string> {
  const block = css.match(new RegExp(`\\[data-palette="${palette}"\\][^{]*\\{([^}]*)\\}`))?.[1];
  if (!block) throw new Error(`Unknown palette: ${palette}`);
  const colors: Record<string, string> = {};
  for (const [, token, light, dark] of block.matchAll(/--([a-z0-9-]+): light-dark\((#[0-9a-f]{6}), (#[0-9a-f]{6})\);/g)) {
    colors[token] = side === "light" ? light : dark;
  }
  return colors;
}
