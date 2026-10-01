// Server-side access to palette colors (OG images). palettes.css stays the single source of truth;
// this module is separate from palettes.ts so the browser bundle never includes the stylesheet text.
import css from "../styles/palettes.css?raw";

export type Side = "light" | "dark";

export function paletteColors(palette: string, side: Side): Record<string, string> {
  const block = css.match(new RegExp(`\\[data-palette="${palette}"\\][^{]*\\{([^}]*)\\}`))?.[1];
  if (!block) throw new Error(`Unknown palette: ${palette}`);
  const colors: Record<string, string> = {};
  for (const [, token, light, dark] of block.matchAll(/--([a-z0-9-]+): light-dark\((#[0-9a-f]{6}), (#[0-9a-f]{6})\);/g)) {
    colors[token] = side === "light" ? light : dark;
  }
  return colors;
}
