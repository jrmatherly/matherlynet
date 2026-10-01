// Parses one palette's colors out of palettes.css text. No imports, so plain Node scripts can use it
// (scripts/social-preview.mts) as well as the app (colors.ts).

export type Side = "light" | "dark";

export function colorsFromCss(css: string, palette: string, side: Side): Record<string, string> {
  // Plain string search, not a RegExp built from `palette` (a CLI argument in social-preview.mts).
  const at = css.indexOf(`[data-palette="${palette}"]`);
  const open = at < 0 ? -1 : css.indexOf("{", at);
  const close = open < 0 ? -1 : css.indexOf("}", open);
  if (close < 0) throw new Error(`Unknown palette: ${palette}`);
  const block = css.slice(open + 1, close);
  const colors: Record<string, string> = {};
  for (const [, token, light, dark] of block.matchAll(/--([a-z0-9-]+): light-dark\((#[0-9a-f]{6}), (#[0-9a-f]{6})\);/g)) {
    colors[token] = side === "light" ? light : dark;
  }
  return colors;
}
