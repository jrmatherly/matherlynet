// Browser-side helpers for the visitor theme controls (ModeToggle, ThemeControls).
import { themeColorTags } from "../theme/theme-color";

// One-year, Lax cookie for a visitor's theme choice; Secure on https.
export const remember = (name: string, value: string): void => {
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${name}=${value}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
};

// Rebuilds <meta name="theme-color"> after a mode or palette switch, as Base.astro would render it: the server
// only computes it per request, so without this the browser chrome keeps the old colour until the next page.
export const syncThemeColor = (): void => {
  // --bg is a light-dark() pair: a hidden probe resolves one side per colour scheme (CSSOM, which the CSP allows).
  const bg = (scheme: "light" | "dark") => {
    const probe = document.createElement("div");
    probe.hidden = true;
    probe.style.colorScheme = scheme;
    probe.style.backgroundColor = "var(--bg)";
    document.body.append(probe);
    const color = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return color;
  };
  const mode = document.documentElement.dataset.mode;
  const tags = themeColorTags(mode === "light" || mode === "dark" ? bg(mode) : { light: bg("light"), dark: bg("dark") });
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove());
  for (const t of tags) {
    const meta = document.createElement("meta");
    meta.name = "theme-color";
    if (t.media) meta.media = t.media;
    meta.content = t.content;
    document.head.append(meta);
  }
};
