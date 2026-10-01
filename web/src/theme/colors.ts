// Server-side access to palette colors (OG images). palettes.css stays the single source of truth;
// this module is separate from palettes.ts so the browser bundle never includes the stylesheet text.
import css from "../styles/palettes.css?raw";
import { colorsFromCss, type Side } from "./palette-css";

export type { Side };

export const paletteColors = (palette: string, side: Side): Record<string, string> => colorsFromCss(css, palette, side);
