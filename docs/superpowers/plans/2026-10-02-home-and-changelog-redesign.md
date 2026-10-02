# Home and Changelog Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the home page from mockup A, add a `/changelog` page from mockup B with a native view transition
between them, extend the theme model with a typeface axis and a "Paper & Evergreen" palette, and close every
finding from the 2026-10-01 UI audit.

**Architecture:** Astro SSR pages read all copy from `src/data/profile.ts`; the theme is resolved in middleware
from cookies plus admin defaults and stamped on `<html>` as `data-palette`, `data-mode` and (new) `data-type`;
colours and the display face are CSS custom properties that Tailwind utilities and a `.display` class consume.
Page transitions are plain CSS (`@view-transition`), no client router.

**Tech Stack:** Astro 7.3.5, Tailwind 4.3.3, better-auth 1.7.7, Drizzle 0.45.3, Vitest, Playwright,
`@fontsource-variable/geist` 5.3.0, `@fontsource-variable/newsreader` 5.3.0, Aspire AppHost.

**Spec:** `docs/superpowers/specs/2026-10-02-home-and-changelog-design.md`

## Global Constraints

- Exact dependency versions, no `^`/`~` (`@fontsource-variable/newsreader` is `5.3.0`).
- Double quotes in `web/` TypeScript/Astro; 2-space indent; semicolons. Markdown wraps at 120 columns.
- Colours only through design tokens (`bg-surface`, `text-muted`, `fill-accent`, …); never a literal hex in a
  component. New palettes need a `palettes.css` block and a `palettes.ts` key (test-enforced, 13 tokens each).
- CSP: no inline `style` attributes, no `on*=` handlers, no unhashed inline scripts. Use classes. `astro dev` does
  not apply the CSP, so check against a build (`/verify` builds).
- Run the app only through Aspire. Shell has `NODE_ENV=production`: prefix `pnpm`, `node`, `npx`, `aspire` with
  `env -u NODE_ENV`. After editing `astro.config.mjs` or dependencies run `env -u NODE_ENV aspire resource web restart`.
- Never hand-edit `web/drizzle/`; change `src/db/schema.ts` and run
  `cd web && APPDB_URI=postgresql://unused env -u NODE_ENV pnpm db:generate`.
- Copy rules (from the audit): no monospace ALL-CAPS eyebrow labels; no `A · B` middle-dot meta strings; no `→`
  appended to link text; no single accent-coloured word in a headline (the changelog's italic final sentence is
  the one deliberate exception); numbered markers only for real sequences (the gateway generations). Every fact
  comes from `profile.ts`; never invent a number, date or feature.
- Before each commit: empty `.claude/auto-memory/dirty-files-*` in a separate Bash call (project hook habit), then
  `/verify` for code changes (not for docs-only commits). Commit messages end with
  `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Never push without Jason's approval.

## Audit traceability

| # | Finding (report of 2026-10-01) | Closed by |
| --- | --- | --- |
| 1 | No contact path, no "open to" line | Task 6 (`contact`, `availability` data), Task 5 (header "Let's talk"), Tasks 7–8 (page actions) |
| 2 | No photograph | Task 7 (home About strip), Task 8 (changelog hero) |
| 3 | Writing in nav but empty | Task 5 (`nav: false` for Writing until a post exists) |
| 4 | Header is product chrome (Brand/Pro, 3-way mode, Sign in) | Task 5 (header: mode control + Let's talk; footer: theme, typeface, sign in) |
| 5 | Fake "Platform status" widget | Task 7 (replaced by the gateway request-path figure) |
| 6 | Template tells (mono eyebrows, `·` strings, `→`, accent word, identical cards, grid backdrop) | Tasks 7–9 (home, changelog, Work/About restyle) |
| 7 | Work cards uneven, pills wrap, empty Kubernetes card | Task 9 (WorkCard becomes a row: period, title, result) |
| 8 | About date column wraps | Task 9 (`whitespace-nowrap`, "2015 – 2021" format) |
| 9 | Brand dark accent 4.18:1 | Task 2 (contrast test; Signal dark accent/ink adjusted) |
| 10 | Brand logo is a 32 px raster | Task 11 (vector mark, decision with Jason) |
| 11 | OG card ignores the /admin palette | Task 10 |
| 12 | No `theme-color`; résumé opens in same tab | Task 10 (theme-color), Tasks 7–9 (`target="_blank" rel="noopener"`) |
| — | Content: headline, availability line, one deep case study, recruiters first, Writing | Tasks 6–8 |

## Review Focus

Inputs the spec implies but no task's tests exercise, most likely to bite first. Each has a test pinned to its task.

1. A `mn-type` cookie with garbage (`type=<script>`) must resolve to the site default, never leak into `data-type`
   → Task 1 test "ignores cookie values it doesn't recognise".
2. A stored `typeface` the code no longer knows (DB row says `"gothic"`) must fall back to `sans`, not crash
   → Task 4 test in `site-settings.test.ts`.
3. A visitor with `prefers-reduced-motion: reduce` must get no view-transition animation and no pulse on the
   gateway figure → Task 3 CSS; Task 13 DevTools check with emulated reduced motion.
4. Narrow screens: the gateway SVG must not shrink its labels below 10 px; it scrolls inside its card instead
   → Task 7 component test asserts `min-width:520px` rule exists; Task 13 measures at 390 px.
5. `availability` is `null` → nothing renders, not an empty bordered line → Task 7 and Task 8 container tests with
   `availability: null`.

---

### Task 0: Branch

**Files:** none

- [ ] **Step 1: Create the branch from `main`**

```bash
cd /Users/jason/dev/matherlynet && git switch -c feat/home-changelog
```

Expected: `Switched to a new branch 'feat/home-changelog'`.

---

### Task 1: Typeface axis in the theme model

**Files:**

- Modify: `web/src/theme/palettes.ts`
- Modify: `web/src/middleware.ts:33-36`
- Modify: `web/src/env.d.ts` (no change needed; `ResolvedTheme` gains a field)
- Test: `web/tests/theme.test.ts`

**Interfaces:**

- Produces: `TYPEFACES: { sans: "Geist"; serif: "Newsreader" }`, `type Typeface = "sans" | "serif"`,
  `TYPE_COOKIE = "mn-type"`, `isTypeface(value: unknown): value is Typeface`,
  `SiteThemeDefaults { theme; proPalette; typeface: Typeface }`,
  `ResolvedTheme { theme; mode; palette; typeface: Typeface }`,
  `resolveTheme(cookies: { theme?: string; mode?: string; type?: string }, site?)`.

- [ ] **Step 1: Write the failing tests** (replace the `resolveTheme` block in `web/tests/theme.test.ts`)

```ts
const site: SiteThemeDefaults = { theme: "brand", proPalette: "cobalt", typeface: "sans" };

describe("resolveTheme", () => {
  it("uses the site defaults when there are no cookies", () => {
    expect(resolveTheme({}, site)).toEqual({ theme: "brand", mode: "system", palette: BRAND_PALETTE, typeface: "sans" });
  });

  it("gives Pro visitors the site's default Pro palette", () => {
    expect(resolveTheme({ theme: "pro", mode: "dark" }, site)).toEqual({
      theme: "pro",
      mode: "dark",
      palette: "cobalt",
      typeface: "sans",
    });
  });

  it("lets a visitor pick the serif display face", () => {
    expect(resolveTheme({ type: "serif" }, site).typeface).toBe("serif");
  });

  it("uses the site's default typeface when the cookie is missing", () => {
    expect(resolveTheme({}, { ...site, typeface: "serif" }).typeface).toBe("serif");
  });

  it("ignores cookie values it doesn't recognise", () => {
    expect(resolveTheme({ theme: "<script>", mode: "neon", type: "<script>" }, site)).toEqual({
      theme: "brand",
      mode: "system",
      palette: BRAND_PALETTE,
      typeface: "sans",
    });
  });

  it("falls back to a valid palette if the stored default is unknown", () => {
    const stale = { theme: "pro", proPalette: "removed", typeface: "sans" } as unknown as SiteThemeDefaults;
    expect(resolveTheme({}, stale).palette).toBe("amber");
  });

  it("falls back to sans if the stored default typeface is unknown", () => {
    const stale = { theme: "brand", proPalette: "amber", typeface: "gothic" } as unknown as SiteThemeDefaults;
    expect(resolveTheme({}, stale).typeface).toBe("sans");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd web && env -u NODE_ENV pnpm vitest run tests/theme.test.ts`
Expected: FAIL — `typeface` missing from results / type errors on `SiteThemeDefaults`.

- [ ] **Step 3: Implement in `palettes.ts`** (add after `PRO_PALETTES`; extend the interfaces; replace `resolveTheme`)

```ts
// Display face for headings. Body text stays Geist either way; see .display in global.css.
export const TYPEFACES = { sans: "Geist", serif: "Newsreader" } as const;
export type Typeface = keyof typeof TYPEFACES;

export interface SiteThemeDefaults {
  theme: Theme;
  proPalette: ProPalette;
  typeface: Typeface;
}

export const SITE_DEFAULTS: SiteThemeDefaults = { theme: "brand", proPalette: "amber", typeface: "sans" };

export const THEME_COOKIE = "mn-theme";
export const MODE_COOKIE = "mn-mode";
export const TYPE_COOKIE = "mn-type";

export interface ResolvedTheme {
  theme: Theme;
  mode: Mode;
  palette: typeof BRAND_PALETTE | ProPalette;
  typeface: Typeface;
}

export const isTypeface = (value: unknown): value is Typeface =>
  typeof value === "string" && Object.hasOwn(TYPEFACES, value);

// Cookies are visitor input: anything unrecognised falls back to the site defaults.
export function resolveTheme(
  cookies: { theme?: string; mode?: string; type?: string },
  site: SiteThemeDefaults = SITE_DEFAULTS,
): ResolvedTheme {
  const theme: Theme = cookies.theme === "brand" || cookies.theme === "pro" ? cookies.theme : site.theme;
  const mode: Mode = cookies.mode === "light" || cookies.mode === "dark" ? cookies.mode : "system";
  const palette = theme === "brand" ? BRAND_PALETTE : isProPalette(site.proPalette) ? site.proPalette : SITE_DEFAULTS.proPalette;
  const typeface: Typeface = isTypeface(cookies.type) ? cookies.type : isTypeface(site.typeface) ? site.typeface : SITE_DEFAULTS.typeface;
  return { theme, mode, palette, typeface };
}
```

- [ ] **Step 4: Pass the cookie through in `middleware.ts`**

```ts
import { MODE_COOKIE, THEME_COOKIE, TYPE_COOKIE, resolveTheme } from "./theme/palettes";
// …
context.locals.theme = resolveTheme(
  {
    theme: context.cookies.get(THEME_COOKIE)?.value,
    mode: context.cookies.get(MODE_COOKIE)?.value,
    type: context.cookies.get(TYPE_COOKIE)?.value,
  },
  siteSettings,
);
```

- [ ] **Step 5: Run the tests and the type-check**

Run: `cd web && env -u NODE_ENV pnpm vitest run tests/theme.test.ts && env -u NODE_ENV pnpm check`
Expected: theme tests PASS. `astro check` will report `typeface` missing in `settings-form.ts`/`site-settings.ts`
(`SiteSettings extends SiteThemeDefaults`): that is Task 4's job; note it and continue.

- [ ] **Step 6: Commit**

```bash
git add web/src/theme/palettes.ts web/src/middleware.ts web/tests/theme.test.ts
git commit -m "Theme: add the typeface axis (mn-type cookie, site default)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: "Paper & Evergreen" palette and a contrast test

**Files:**

- Modify: `web/src/styles/palettes.css` (append a block; adjust Signal's dark accent)
- Modify: `web/src/theme/palettes.ts:6-18` (`PRO_PALETTES`)
- Test: `web/tests/theme.test.ts`

**Interfaces:**

- Produces: palette key `paper` (display name "Paper & Evergreen").

- [ ] **Step 1: Add the contrast test** (append to the `palettes.css` describe block)

```ts
import { colorsFromCss } from "../src/theme/palette-css";

// WCAG 2.1 relative luminance and contrast ratio.
const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
};

it("keeps accent, accent-ink and muted text at AA (4.5:1) in every palette and mode", () => {
  for (const palette of [BRAND_PALETTE, ...Object.keys(PRO_PALETTES)]) {
    for (const side of ["light", "dark"] as const) {
      const c = colorsFromCss(css, palette, side);
      expect(contrast(c.accent, c.bg), `${palette}/${side} accent on bg`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(c["accent-ink"], c.accent), `${palette}/${side} accent-ink on accent`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(c.muted, c.bg), `${palette}/${side} muted on bg`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(c.muted, c.surface), `${palette}/${side} muted on surface`).toBeGreaterThanOrEqual(4.5);
    }
  }
});
```

- [ ] **Step 2: Run it to see which palettes fail**

Run: `cd web && env -u NODE_ENV pnpm vitest run tests/theme.test.ts`
Expected: FAIL at least for `signal/dark accent on bg` (4.18). Record every failing line.

- [ ] **Step 3: Add the `paper` palette** (append to `palettes.css`; danger/success/info/warning copied from Flare)

```css
:root[data-palette="paper"] { /* Paper & Evergreen */
  --bg: light-dark(#f3f4f1, #0e1211);
  --surface: light-dark(#ffffff, #151a18);
  --surface-2: light-dark(#e9ebe6, #1b211e);
  --border: light-dark(#cfd3cc, #2a312d);
  --text: light-dark(#16191d, #edf0ec);
  --muted: light-dark(#555b61, #a3aaa5);
  --accent: light-dark(#0f7a63, #3fbf9b);
  --accent-ink: light-dark(#ffffff, #06211b);
  --accent-soft: light-dark(#dcefe8, #10302a);
  --danger: light-dark(#b4233f, #ff6b81);
  --success: light-dark(#1d7f4b, #5cc489);
  --info: light-dark(#1f6fb8, #7cc4ff);
  --warning: light-dark(#8a6100, #e5b545);
}
```

And in `palettes.ts` add `paper: "Paper & Evergreen",` after `oxide`.

- [ ] **Step 4: Fix the failing palettes.** For Signal dark, a red that passes both checks against near-black needs a
dark ink: change the two lines to

```css
  --accent: light-dark(#c8231b, #ef4b42);
  --accent-ink: light-dark(#ffffff, #1a0707);
```

For any other failing pair reported in Step 2, nudge the failing token (lighten a dark-mode accent or darken a
light-mode one; use a dark `accent-ink` wherever the dark-mode accent is light) until the test passes. Keep the
hue; change lightness only. Note each change in the commit message.

- [ ] **Step 5: Run the tests**

Run: `cd web && env -u NODE_ENV pnpm vitest run tests/theme.test.ts tests/og.test.ts`
Expected: PASS (palette count test now expects 12 Pro palettes; contrast test green).

- [ ] **Step 6: Commit**

```bash
git add web/src/styles/palettes.css web/src/theme/palettes.ts web/tests/theme.test.ts
git commit -m "Palettes: add Paper & Evergreen; enforce AA contrast; fix Signal dark accent

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Newsreader, display tokens, `data-type`, view-transition CSS

**Files:**

- Modify: `web/package.json` (dependency), `web/astro.config.mjs:51-70` (fonts)
- Modify: `web/src/styles/global.css`
- Modify: `web/src/layouts/Base.astro`
- Test: `web/tests/theme.test.ts` (CSS presence assertions)

**Interfaces:**

- Produces: CSS class `.display` (heading face/weight/tracking from `--display-*`), `html[data-type]`,
  `--font-newsreader` from Astro's `<Font>`.

- [ ] **Step 1: Install the font package (exact version)**

Run: `cd web && env -u NODE_ENV pnpm add @fontsource-variable/newsreader@5.3.0`
Expected: `package.json` gains `"@fontsource-variable/newsreader": "5.3.0"` with no range prefix (pnpm may record
`minimumReleaseAgeExclude`; keep what it writes). Verify:
`ls node_modules/@fontsource-variable/newsreader/files | grep latin-wght`
shows `newsreader-latin-wght-normal.woff2` and `newsreader-latin-wght-italic.woff2`.

- [ ] **Step 2: Write the failing CSS assertions** (append a describe to `theme.test.ts`)

```ts
describe("global.css", () => {
  const css = readFileSync(new URL("../src/styles/global.css", import.meta.url), "utf8");

  it("switches the display face with data-type", () => {
    expect(css).toMatch(/:root\[data-type="serif"\]\s*\{[^}]*--display-face: var\(--font-newsreader\)/);
    expect(css).toMatch(/\.display\s*\{[^}]*font-family: var\(--display-face\)/);
  });

  it("enables cross-document view transitions and disables them under reduced motion", () => {
    expect(css).toContain("@view-transition { navigation: auto; }");
    expect(css).toMatch(/prefers-reduced-motion: reduce[\s\S]*::view-transition-group\(\*\)[\s\S]*animation: none/);
  });
});
```

Run: `cd web && env -u NODE_ENV pnpm vitest run tests/theme.test.ts` — Expected: FAIL.

- [ ] **Step 3: Add the font family to `astro.config.mjs`** (after the Geist Mono entry)

```js
    {
      provider: npmFonts,
      name: "Newsreader Variable",
      cssVariable: "--font-newsreader",
      weights: ["200 800"],
      styles: ["normal", "italic"],
      fallbacks: ["Georgia", "serif"],
      options: { package: "@fontsource-variable/newsreader" },
    },
```

- [ ] **Step 4: Tokens and transitions in `global.css`** (add after the `:root[data-mode]` lines)

```css
/* Display face for headings: Geist by default, Newsreader when the visitor (or the site default) picks serif.
   Body text is always Geist. */
:root { --display-face: var(--font-geist); --display-weight: 800; --display-tracking: -0.03em; }
:root[data-type="serif"] { --display-face: var(--font-newsreader); --display-weight: 500; --display-tracking: -0.015em; }

@layer components {
  .display { font-family: var(--display-face); font-weight: var(--display-weight); letter-spacing: var(--display-tracking); line-height: 1.05; text-wrap: balance; }
}

/* Cross-document view transitions: the header holds still (view-transition-name in SiteHeader), the rest
   cross-fades, so a palette or typeface change between pages re-colours instead of flashing. */
@view-transition { navigation: auto; }
::view-transition-old(root), ::view-transition-new(root) { animation-duration: 400ms; }
@media (prefers-reduced-motion: reduce) {
  ::view-transition-group(*), ::view-transition-old(*), ::view-transition-new(*) { animation: none; }
}
```

- [ ] **Step 5: `Base.astro`: load the font and stamp the attribute**

```astro
const { theme, mode, palette, typeface } = Astro.locals.theme;
---
<html lang="en" data-palette={palette} data-mode={mode} data-type={typeface}>
  …
    <Font cssVariable="--font-geist" preload />
    <Font cssVariable="--font-geist-mono" />
    <Font cssVariable="--font-newsreader" />
```

- [ ] **Step 6: Run tests, type-check, restart the web resource and look**

Run: `cd web && env -u NODE_ENV pnpm vitest run tests/theme.test.ts && env -u NODE_ENV pnpm check`
Then: `env -u NODE_ENV aspire resource web restart` and
`curl -s http://localhost:4321/ | grep -o 'data-type="[a-z]*"'` → `data-type="sans"`.
`curl -s http://localhost:4321/ | grep -c newsreader` → at least 1 (a `@font-face` or preload for the serif).

- [ ] **Step 7: Commit**

```bash
git add web/package.json web/pnpm-lock.yaml web/astro.config.mjs web/src/styles/global.css web/src/layouts/Base.astro web/tests/theme.test.ts
git commit -m "Theme: Newsreader display face behind data-type; native view transitions

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Typeface default in site settings and /admin

**Files:**

- Modify: `web/src/db/schema.ts:7-24`
- Create (generated): `web/drizzle/0003_*.sql` via `pnpm db:generate`
- Modify: `web/src/lib/site-settings.ts:20-31,64-79`
- Modify: `web/src/lib/settings-form.ts:85-88` and the returned `settings` object
- Modify: `web/src/pages/admin.astro:33-54`
- Test: `web/tests/settings-form.test.ts`, `web/tests/site-settings.test.ts`

**Interfaces:**

- Consumes: `isTypeface`, `Typeface`, `SITE_DEFAULTS.typeface` (Task 1).
- Produces: `SiteSettings.typeface`, DB column `site_settings.typeface`.

- [ ] **Step 1: Failing tests.** In `settings-form.test.ts` change the `form()` defaults to
`{ theme: "pro", proPalette: "merlot", typeface: "serif", ...fields }`, add `typeface: "serif"` to the expected
`settings` in "accepts a complete form", and add to the `it.each` list:

```ts
    ["an unknown typeface", { typeface: "gothic" }],
```

In `site-settings.test.ts` add:

```ts
  it("falls back to sans when the stored typeface is unknown", async () => {
    select.mockResolvedValue([{ theme: "pro", proPalette: "merlot", typeface: "gothic" }]);
    const { getSiteSettings } = await import("../src/lib/site-settings");
    await expect(getSiteSettings()).resolves.toMatchObject({ typeface: "sans" });
  });
```

Run: `cd web && env -u NODE_ENV pnpm vitest run tests/settings-form.test.ts tests/site-settings.test.ts` — Expected: FAIL.

- [ ] **Step 2: Schema column** (after `proPalette` in `schema.ts`)

```ts
    // Display face for headings: "sans" (Geist) or "serif" (Newsreader). Default so the existing row migrates.
    typeface: text("typeface").notNull().default("sans"),
```

- [ ] **Step 3: Generate the migration**

Run: `cd web && APPDB_URI=postgresql://unused env -u NODE_ENV pnpm db:generate`
Expected: a new `web/drizzle/0003_<name>.sql` containing
`ALTER TABLE "site_settings" ADD COLUMN "typeface" text DEFAULT 'sans' NOT NULL;` and updated `drizzle/meta/`.
Do not edit it.

- [ ] **Step 4: `site-settings.ts`**

```ts
import { SITE_DEFAULTS, isProPalette, isTypeface } from "../theme/palettes";
// fromRow:
    typeface: isTypeface(row?.typeface) ? row.typeface : SITE_DEFAULTS.typeface,
// saveSiteSettings row:
    typeface: value.typeface,
```

- [ ] **Step 5: `settings-form.ts`**

```ts
import { isProPalette, isTypeface, type SiteThemeDefaults } from "../theme/palettes";
// parseSettingsForm:
  const theme = form.get("theme");
  const proPalette = form.get("proPalette");
  const typeface = form.get("typeface");
  if ((theme !== "brand" && theme !== "pro") || !isProPalette(proPalette)) return { error: "Pick a theme and a Pro palette." };
  if (!isTypeface(typeface)) return { error: "Pick a display typeface." };
  // … and in the returned object:
  return { settings: { theme, proPalette, typeface, sentry: …, umami: … } };
```

- [ ] **Step 6: `/admin` form** (inside the Theme fieldset, after the palette select)

```astro
      <div class="grid gap-1.5">
        <span class="text-sm font-semibold">Display typeface</span>
        <div class="flex flex-wrap gap-4">
          <label class={check}>
            <input type="radio" name="typeface" value="sans" checked={current.typeface === "sans"} /> Geist (sans)
          </label>
          <label class={check}>
            <input type="radio" name="typeface" value="serif" checked={current.typeface === "serif"} /> Newsreader (serif)
          </label>
        </div>
      </div>
```

- [ ] **Step 7: Run the tests and the type-check**

Run: `cd web && env -u NODE_ENV pnpm vitest run && env -u NODE_ENV pnpm check`
Expected: all PASS; `astro check` clean (the Task 1 `typeface` errors are gone).
Then `env -u NODE_ENV aspire resource web restart` (migration applies on start) and
`env -u NODE_ENV aspire logs web | grep -i migrat` shows the migration applied.

- [ ] **Step 8: Commit**

```bash
git add web/src/db/schema.ts web/drizzle web/src/lib/site-settings.ts web/src/lib/settings-form.ts web/src/pages/admin.astro web/tests/settings-form.test.ts web/tests/site-settings.test.ts
git commit -m "Site settings: default display typeface (column, /admin, validation)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Header and footer: mode control up top, theme controls below, Changelog in the nav

**Files:**

- Create: `web/src/components/ModeToggle.astro`, `web/src/components/ThemeControls.astro`
- Delete: `web/src/components/ThemeToggle.astro`, `web/tests/ThemeToggle.test.ts`
- Modify: `web/src/components/SiteHeader.astro`, `web/src/components/SiteFooter.astro`, `web/src/lib/site.ts`
- Test: `web/tests/ThemeControls.test.ts` (new), `web/e2e/public.spec.ts`

**Interfaces:**

- Consumes: `ResolvedTheme`, `TYPE_COOKIE`, `TYPEFACES`, `BRAND_PALETTE`, `PRO_PALETTES`.
- Produces: `person.linkedin` is `person.sameAs[0]` (already); `publicRoutes` with `/changelog`.

- [ ] **Step 1: Failing component test** `web/tests/ThemeControls.test.ts`

```ts
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { describe, expect, it } from "vitest";
import ModeToggle from "../src/components/ModeToggle.astro";
import ThemeControls from "../src/components/ThemeControls.astro";

const render = async (Component: Parameters<AstroContainer["renderToString"]>[0], props: Record<string, unknown>) =>
  (await AstroContainer.create()).renderToString(Component, { props });

describe("ModeToggle", () => {
  it("marks the current mode as pressed", async () => {
    const html = await render(ModeToggle, { mode: "dark" });
    expect(html).toMatch(/data-set-mode="dark"[^>]*aria-pressed="true"/);
    expect(html).toMatch(/data-set-mode="system"[^>]*aria-pressed="false"/);
  });
});

describe("ThemeControls", () => {
  it("marks the current theme and typeface as pressed and names the Pro palette", async () => {
    const html = await render(ThemeControls, { theme: "pro", typeface: "serif", proPalette: "paper" });
    expect(html).toMatch(/data-set-theme="pro"[^>]*aria-pressed="true"/);
    expect(html).toMatch(/data-set-type="serif"[^>]*aria-pressed="true"/);
    expect(html).toMatch(/data-set-type="sans"[^>]*aria-pressed="false"/);
    expect(html).toContain('data-pro-palette="paper"');
    expect(html).toContain('title="Paper & Evergreen"');
  });
});
```

Run: `cd web && env -u NODE_ENV pnpm vitest run tests/ThemeControls.test.ts` — Expected: FAIL (components missing).

- [ ] **Step 2: `ModeToggle.astro`** (the mode third of today's `ThemeToggle.astro`; the client script writes the
cookie and `data-mode`)

```astro
---
import type { ResolvedTheme } from "../theme/palettes";

interface Props {
  mode: ResolvedTheme["mode"];
}

const { mode } = Astro.props;
const modes = [
  { value: "light", label: "Light", icon: "M8 3.2a4.8 4.8 0 1 0 0 9.6 4.8 4.8 0 0 0 0-9.6Z" },
  { value: "dark", label: "Dark", icon: "M6 1a7 7 0 1 0 9 9A6 6 0 0 1 6 1Z" },
  { value: "system", label: "Match system", icon: "M2 3h12v8H2zM6 13h4" },
] as const;
const option =
  "inline-flex items-center rounded-full px-2.5 py-1.5 text-muted transition-colors hover:text-foreground aria-pressed:bg-surface-2 aria-pressed:text-foreground aria-pressed:shadow-[inset_0_0_0_1px_var(--border)]";
---

<div role="group" aria-label="Color mode" class="inline-flex rounded-full border border-border bg-surface p-0.5" data-mode-toggle>
  {
    modes.map((m) => (
      <button type="button" class={option} data-set-mode={m.value} aria-pressed={mode === m.value} aria-label={m.label} title={m.label}>
        <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
          <path d={m.icon} />
        </svg>
      </button>
    ))
  }
</div>

<script>
  import { MODE_COOKIE } from "../theme/palettes";
  import { remember } from "../lib/theme-cookie";

  const root = document.documentElement;
  document.querySelectorAll<HTMLElement>("[data-mode-toggle]").forEach((group) =>
    group.querySelectorAll<HTMLButtonElement>("[data-set-mode]").forEach((button) =>
      button.addEventListener("click", () => {
        const mode = button.dataset.setMode!;
        root.dataset.mode = mode;
        remember(MODE_COOKIE, mode);
        group.querySelectorAll<HTMLButtonElement>("[data-set-mode]").forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
      }),
    ),
  );
</script>
```

Create `web/src/lib/theme-cookie.ts` (shared by both controls):

```ts
// One-year, Lax cookie for a visitor's theme choice; Secure on https.
export const remember = (name: string, value: string): void => {
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${name}=${value}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
};
```

- [ ] **Step 3: `ThemeControls.astro`** (Brand/Pro and Sans/Serif; lives in the footer)

```astro
---
import { PRO_PALETTES, TYPEFACES, type ProPalette, type ResolvedTheme } from "../theme/palettes";

interface Props {
  theme: ResolvedTheme["theme"];
  typeface: ResolvedTheme["typeface"];
  proPalette: ProPalette;
}

const { theme, typeface, proPalette } = Astro.props;
const segment = "inline-flex rounded-full border border-border bg-surface p-0.5";
const option =
  "inline-flex items-center rounded-full px-2.5 py-1.5 text-xs font-semibold text-muted transition-colors hover:text-foreground aria-pressed:bg-surface-2 aria-pressed:text-foreground aria-pressed:shadow-[inset_0_0_0_1px_var(--border)]";
---

<div class="flex flex-wrap items-center gap-2" data-theme-controls data-pro-palette={proPalette}>
  <div role="group" aria-label="Theme" class={segment}>
    <button type="button" class={option} data-set-theme="brand" aria-pressed={theme === "brand"}>Brand</button>
    <button type="button" class={option} data-set-theme="pro" aria-pressed={theme === "pro"} title={PRO_PALETTES[proPalette]}>Pro</button>
  </div>
  <div role="group" aria-label="Display typeface" class={segment}>
    {
      (Object.keys(TYPEFACES) as (keyof typeof TYPEFACES)[]).map((key) => (
        <button type="button" class={option} data-set-type={key} aria-pressed={typeface === key} title={TYPEFACES[key]}>
          {key === "sans" ? "Sans" : "Serif"}
        </button>
      ))
    }
  </div>
</div>

<script>
  import { BRAND_PALETTE, THEME_COOKIE, TYPE_COOKIE } from "../theme/palettes";
  import { remember } from "../lib/theme-cookie";

  const root = document.documentElement;
  const controls = document.querySelector<HTMLElement>("[data-theme-controls]");
  const press = (attr: string, value: string) =>
    controls?.querySelectorAll<HTMLButtonElement>(`[${attr}]`).forEach((b) => b.setAttribute("aria-pressed", String(b.getAttribute(attr) === value)));

  controls?.querySelectorAll<HTMLButtonElement>("[data-set-theme]").forEach((button) =>
    button.addEventListener("click", () => {
      const theme = button.dataset.setTheme!;
      root.dataset.palette = theme === "pro" ? controls.dataset.proPalette! : BRAND_PALETTE;
      // Brand icons live at the public root, Pro icons under /pro/.
      document.querySelectorAll<HTMLLinkElement>("link[data-icon]").forEach((link) => {
        link.href = `${theme === "pro" ? "/pro/" : "/"}${link.dataset.icon}`;
      });
      remember(THEME_COOKIE, theme);
      press("data-set-theme", theme);
    }),
  );

  controls?.querySelectorAll<HTMLButtonElement>("[data-set-type]").forEach((button) =>
    button.addEventListener("click", () => {
      const type = button.dataset.setType!;
      root.dataset.type = type;
      remember(TYPE_COOKIE, type);
      press("data-set-type", type);
    }),
  );
</script>
```

- [ ] **Step 4: Routes.** In `web/src/lib/site.ts`:

```ts
export const publicRoutes: { path: string; label: string; nav: boolean }[] = [
  { path: "/", label: "Home", nav: false },
  { path: "/work", label: "Work", nav: true },
  { path: "/changelog", label: "Changelog", nav: true },
  // Hidden from the nav until the first post is published (the page, feed and sitemap stay live).
  { path: "/writing", label: "Writing", nav: false },
  { path: "/about", label: "About", nav: true },
];
```

- [ ] **Step 5: `SiteHeader.astro`** (replace the file)

```astro
---
import Logo from "./Logo.astro";
import ModeToggle from "./ModeToggle.astro";
import { person, publicRoutes } from "../lib/site";

interface Props {
  // Minimal chrome (sign-in, 404): no nav or contact action.
  minimal?: boolean;
}

const { minimal = false } = Astro.props;
const { theme } = Astro.locals;
const path = Astro.url.pathname;
const nav = minimal ? [] : publicRoutes.filter((r) => r.nav);
const link = "rounded-md px-2 py-1 text-sm text-muted transition-colors hover:text-foreground aria-[current=page]:text-foreground";
---

<!-- view-transition-name keeps the header still while the page body cross-fades (global.css). -->
<header class="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur [view-transition-name:site-header]">
  <div class="mx-auto flex max-w-6xl items-center gap-x-6 px-4 py-3 sm:px-6">
    <a href="/" class="inline-flex items-center gap-2.5 font-extrabold tracking-tight">
      <Logo />{person.name}
    </a>
    {
      nav.length > 0 && (
        <nav aria-label="Main" class="hidden flex-1 gap-1 sm:flex">
          {nav.map((r) => (
            <a href={r.path} class={link} aria-current={path === r.path ? "page" : undefined}>
              {r.label}
            </a>
          ))}
        </nav>
      )
    }
    <div class="ml-auto flex items-center gap-3">
      <ModeToggle mode={theme.mode} />
      {
        !minimal && (
          <a href={person.sameAs[0]} rel="me noopener" class="rounded-full bg-accent px-3.5 py-1.5 text-sm font-semibold text-accent-foreground">
            Let's talk
          </a>
        )
      }
    </div>
  </div>
  {
    nav.length > 0 && (
      <nav aria-label="Main" class="mx-auto flex max-w-6xl gap-1 px-4 pb-2 sm:hidden">
        {nav.map((r) => (
          <a href={r.path} class={link} aria-current={path === r.path ? "page" : undefined}>
            {r.label}
          </a>
        ))}
      </nav>
    )
  }
</header>
```

Note: two `nav` elements with the same label would confuse assistive tech; give the phone one
`aria-label="Main, compact"` and keep Playwright's selector on `{ name: "Main" }` with `exact: true`.

- [ ] **Step 6: `SiteFooter.astro`** (replace the file)

```astro
---
import ThemeControls from "./ThemeControls.astro";
import { person } from "../lib/site";

const year = new Date().getFullYear();
const label: Record<string, string> = { "www.linkedin.com": "LinkedIn", "github.com": "GitHub" };
const { user, theme, siteSettings } = Astro.locals;
const quiet = "hover:text-foreground";
---

<footer class="border-t border-border">
  <div class="mx-auto grid max-w-6xl gap-5 px-4 py-8 text-sm text-muted sm:px-6">
    <div class="flex flex-wrap items-center justify-between gap-4">
      <ThemeControls theme={theme.theme} typeface={theme.typeface} proPalette={siteSettings.proPalette} />
      <nav aria-label="Elsewhere" class="flex flex-wrap gap-4">
        {
          person.sameAs.map((href) => (
            <a href={href} rel="me noopener" class={quiet}>
              {label[new URL(href).host] ?? new URL(href).host}
            </a>
          ))
        }
        <a href="/rss.xml" class={quiet}>RSS</a>
        {user ? <a href="/account" class={quiet}>Account</a> : <a href="/sign-in" class={quiet}>Sign in</a>}
      </nav>
    </div>
    <span>© {year} {person.name}, {person.locality}</span>
  </div>
</footer>
```

- [ ] **Step 7: Delete the old component and test; update Playwright**

```bash
git rm web/src/components/ThemeToggle.astro web/tests/ThemeToggle.test.ts
```

In `web/e2e/public.spec.ts`:

- nav loop labels → `["Work", "Changelog", "About"]`; the heading assertion stays.
- "the theme choice survives a reload": keep the `Pro` and `Dark` clicks (buttons are found anywhere on the
  page), add `await page.getByRole("button", { name: "Serif" }).click();` before the reload and
  `await expect(html).toHaveAttribute("data-type", "serif");` after it.

- [ ] **Step 8: Run tests, check, restart and smoke**

Run: `cd web && env -u NODE_ENV pnpm vitest run && env -u NODE_ENV pnpm check && env -u NODE_ENV pnpm lint`
Expected: PASS/clean. Then `env -u NODE_ENV aspire resource web restart`;
`curl -s http://localhost:4321/ | grep -c 'Let'"'"'s talk'` → 1;
`curl -s http://localhost:4321/changelog -o /dev/null -w "%{http_code}"` → 404
(the page arrives in Task 8; the nav link is allowed to 404 until then).

- [ ] **Step 9: Commit**

```bash
git add -A web/src/components web/src/lib/site.ts web/src/lib/theme-cookie.ts web/tests web/e2e/public.spec.ts
git commit -m "Chrome: mode control + Let's talk in the header; theme and typeface controls in the footer; Changelog nav

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Profile data for the new pages

**Files:**

- Modify: `web/src/data/profile.ts`
- Test: `web/tests/profile.test.ts` (new)

**Interfaces:**

- Produces:
  - `headline: string`, `intro: string`, `availability: string | null`, `contact: { label: string; href: string }`
  - `gateway: { title; summary; generations: { name; note; current: boolean }[]; results: { value; label }[] }`
  - `Role` gains `heading: string` and `summary: string` (used by the changelog)
  - `work` items gain `period: string` ("2021 to now" | "2015 to 2021") and `result: string` (one short line)
  - `recruiterFacts: { term: string; detail: string }[]`
  - `bio: string`, `facts: { title: string; detail: string }[]`

- [ ] **Step 1: Failing test** `web/tests/profile.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { availability, career, gateway, headline, recruiterFacts, work } from "../src/data/profile";

describe("profile data", () => {
  it("has a headline and no placeholder availability copy", () => {
    expect(headline.length).toBeGreaterThan(10);
    if (availability !== null) expect(availability).not.toMatch(/confirm|placeholder|TBD/i);
  });

  it("gives every role a heading and summary for the changelog", () => {
    for (const role of career) {
      expect(role.heading.length).toBeGreaterThan(0);
      expect(role.summary.length).toBeGreaterThan(0);
    }
  });

  it("gives every platform a period and a one-line result", () => {
    for (const item of work) {
      expect(item.period).toMatch(/^20\d\d to (20\d\d|now)$/);
      expect(item.result.length).toBeLessThanOrEqual(110);
    }
  });

  it("marks exactly one gateway generation as current", () => {
    expect(gateway.generations.filter((g) => g.current)).toHaveLength(1);
    expect(gateway.results).toHaveLength(3);
  });

  it("lists the recruiter screening facts", () => {
    expect(recruiterFacts.map((f) => f.term)).toEqual(["Current title", "Team", "Location", "Education", "Languages"]);
  });
});
```

Run: `cd web && env -u NODE_ENV pnpm vitest run tests/profile.test.ts` — Expected: FAIL.

- [ ] **Step 2: Add the data** (edit `profile.ts`; keep existing exports; copy is from the approved mockups and the
résumé — change nothing factual)

```ts
export const headline = "I run the platform 15,000 people's AI goes through.";
export const intro =
  "Seventeen years at The Aaron's Company, from store networks to the company's AI Gateway, MCP platform and Kubernetes clusters, with security, governance and cost accounting designed in from the start.";
// Rendered only when set. Jason supplies the wording (roles, remote/Atlanta, timing).
export const availability: string | null = null;
export const contact = { label: "Message me on LinkedIn", href: "https://www.linkedin.com/in/jason-matherly" } as const;

export const gateway = {
  title: "AI Gateway",
  summary:
    "Started as a quick way to give teams safe access to models. Each generation was replaced when it could no longer answer the questions the business asked: who is spending what, on which model, and under which rules.",
  generations: [
    { name: "LiteLLM", note: "Fast to stand up, proved demand. Couldn't attribute cost per team or enforce policy per use case.", current: false },
    { name: "Azure API Management", note: "Added SSO and rate limits. Routing and guardrails were awkward to express, and licensing costs grew with usage.", current: false },
    {
      name: "In-house platform",
      note: "SSO, per-user and per-team cost accounting, rate limiting, guardrails, model routing across Azure AI Foundry and Anthropic, audit logging.",
      current: true,
    },
  ],
  results: [
    { value: "~2 billion", label: "tokens a month" },
    { value: "Near zero", label: "projected AI licensing cost" },
    { value: "Every call", label: "attributed, limited, logged" },
  ],
} as const;

export const recruiterFacts = [
  { term: "Current title", detail: "Manager, Infrastructure Services" },
  { term: "Team", detail: "4 direct reports; 8 while leading BrandsMart's team after the acquisition" },
  { term: "Location", detail: "Atlanta, remote since 2020" },
  { term: "Education", detail: "B.S. Computer Science, Kennesaw State" },
  { term: "Languages", detail: "Python, TypeScript, Go" },
];

export const bio =
  "I joined The Aaron's Company as a Network Analyst in 2009 and grew with it: Network Engineer, Senior Infrastructure Engineer, and since 2021 Manager of Infrastructure Services. Along the way I built the store network, the data centers and the Azure footprint, then turned to the question of how a 15,000-person company adopts AI without losing control of cost, data or risk.";
export const facts = [
  { title: "Atlanta, GA", detail: "remote since 2020" },
  { title: "Kennesaw State", detail: "B.S. Computer Science" },
  { title: "Spoons of Salt", detail: "volunteer IT since 2023" },
];
```

Extend `WorkItem` with `period: string; result: string;` and set, in the existing order of `work`:

```ts
// AI Gateway
period: "2021 to now", result: "~2 billion tokens a month; projected licensing cost cut to near zero",
// MCP Gateway, Registry & Portal
period: "2021 to now", result: "About 20 managed MCP servers behind OAuth and tool-approval workflows",
// AI chat platform & agents
period: "2021 to now", result: "About 30 agents grounded in company knowledge, 400 users across 14 teams",
// On-prem Kubernetes platform
period: "2021 to now", result: "Talos Linux, Flux and Argo CD, Cilium, External Secrets backed by Secret Server",
// SD-WAN for every store
period: "2015 to 2021", result: "CloudGenix to 2,300+ stores, later migrated to Meraki",
// Data centers & disaster recovery
period: "2015 to 2021",
result: "New primary data center and DR site, Nimble to Pure Storage, Azure with ExpressRoute; zero unplanned downtime",
```

Extend `Role` with `heading: string; summary: string;` and set, in the existing order of `career`:

```ts
// Manager, Infrastructure Services
heading: "One gateway, three generations",
summary:
  "The company's single path to large language models. Each generation was retired when it couldn't answer the business's questions: who is spending what, on which model, under which rules.",
// Sr. Infrastructure Engineer
heading: "A new data center, a DR site, and SD-WAN to every store",
summary:
  "Directed the primary data center build-out and migration with zero unplanned downtime, then the disaster recovery site and the move from HPE Nimble to Pure Storage. Established the Azure tenant and ExpressRoute. Rolled SD-WAN to 2,300+ stores, and had Always-On VPN ready the day the company went remote.",
// Network Engineer
heading: "One addressing plan for 2,300 stores",
summary:
  "Designed a standard IP plan and re-addressed every store network. Led the firewall migrations to Palo Alto and Meraki, and the Secret Server PAM rollout.",
// Network Analyst
heading: "Started where the packets start",
summary:
  "Store network connectivity and SonicWALL firewall deployments, while finishing a Computer Science degree at Kennesaw State (Southern Polytechnic), 2008 to 2012.",
```

Reorder `perspectives` so `recruiters` is first, and change its `headline` to "Nearly 17 years, one company,
three promotions." (unchanged text) — the recruiter panel on the pages renders `recruiterFacts` under it.

- [ ] **Step 3: Run the test and type-check**

Run: `cd web && env -u NODE_ENV pnpm vitest run tests/profile.test.ts && env -u NODE_ENV pnpm check` — Expected: PASS/clean.

- [ ] **Step 4: Commit**

```bash
git add web/src/data/profile.ts web/tests/profile.test.ts
git commit -m "Profile: headline, availability, gateway case study, role headings, platform results

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Home page from mockup A

**Files:**

- Create: `web/src/components/GatewayPath.astro`, `web/src/components/CaseStudy.astro`,
  `web/src/components/PlatformList.astro`, `web/src/components/AboutStrip.astro`, `web/src/components/Cta.astro`,
  `web/src/components/Availability.astro`
- Modify: `web/src/components/Perspectives.astro`, `web/src/pages/index.astro`
- Delete: `web/src/components/StatusPanel.astro`
- Create: `web/public/portrait.jpg` (copy of `/Users/jason/Pictures/matherly.jpg`)
- Test: `web/tests/home.test.ts` (new)

**Interfaces:**

- Consumes: everything from Task 6; `.display` (Task 3); `contact`.
- Produces: `Availability` renders nothing when `availability` is null; `GatewayPath` SVG scrolls inside its card
  below 600 px.

- [ ] **Step 1: Failing tests** `web/tests/home.test.ts`

```ts
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { describe, expect, it } from "vitest";
import Availability from "../src/components/Availability.astro";
import GatewayPath from "../src/components/GatewayPath.astro";

const render = async (Component: Parameters<AstroContainer["renderToString"]>[0], props: Record<string, unknown> = {}) =>
  (await AstroContainer.create()).renderToString(Component, { props });

describe("Availability", () => {
  it("renders nothing when there is no wording", async () => {
    expect((await render(Availability, { text: null })).trim()).toBe("");
  });
  it("renders the line when wording is set", async () => {
    expect(await render(Availability, { text: "Open to platform leadership roles." })).toContain("Open to platform leadership roles.");
  });
});

describe("GatewayPath", () => {
  it("is an accessible figure that scrolls rather than shrinks on phones", async () => {
    const html = await render(GatewayPath);
    expect(html).toContain('role="img"');
    expect(html).toMatch(/<title[^>]*>How a request moves through the AI Gateway<\/title>/);
    expect(html).toContain("min-w-[520px]");
    expect(html).toContain("motion-reduce:hidden");
  });
});
```

Run: `cd web && env -u NODE_ENV pnpm vitest run tests/home.test.ts` — Expected: FAIL.

- [ ] **Step 2: Portrait**

```bash
cp /Users/jason/Pictures/matherly.jpg /Users/jason/dev/matherlynet/web/public/portrait.jpg
```

- [ ] **Step 3: `Availability.astro`**

```astro
---
interface Props {
  text: string | null;
}
const { text } = Astro.props;
---

{
  text && (
    <p class="flex items-start gap-2.5 text-sm">
      <span class="mt-1.5 size-2 shrink-0 rounded-full bg-success" aria-hidden="true" />
      <span>{text}</span>
    </p>
  )
}
```

- [ ] **Step 4: `GatewayPath.astro`** (the figure from mockup A; colours via `fill-*`/`stroke-*` token utilities)

```astro
---
// How a request moves through the AI Gateway: drawn, not a screenshot, so it follows the palette.
// Below 600px the SVG keeps its 520px drawing width and scrolls inside the card: shrinking it makes the labels
// unreadable (audited at 4.6px).
const node = "fill-surface-2 stroke-border";
const text = "fill-foreground text-[12px]";
const small = "fill-muted text-[10.5px]";
const wire = "fill-none stroke-border stroke-[1.5]";
---

<figure class="m-0 overflow-x-auto rounded-2xl border border-border bg-surface p-5 pb-3.5">
  <svg viewBox="0 0 520 300" role="img" aria-labelledby="path-title path-desc" class="block h-auto w-full min-w-[520px] font-sans sm:min-w-0">
    <title id="path-title">How a request moves through the AI Gateway</title>
    <desc id="path-desc">A person signs in with SSO, the gateway applies rate limits, guardrails, cost accounting and model routing, then calls Azure AI Foundry or Anthropic. Every call is written to the audit log.</desc>
    <path class={wire} d="M92 70 H150" />
    <path class={wire} d="M370 70 H410 Q426 70 426 86 V105" />
    <path class={wire} d="M370 70 H410 Q426 70 426 54 V35" />
    <path class={wire} d="M260 142 V190" />
    <path class={wire} d="M142 213 H170" />
    <rect class={node} x="12" y="44" width="80" height="52" rx="8" />
    <text class={text} x="52" y="66" text-anchor="middle">A person</text>
    <text class={small} x="52" y="82" text-anchor="middle">SSO sign-in</text>
    <rect class="fill-accent-soft stroke-accent" x="150" y="18" width="220" height="124" rx="10" />
    <text class={`${text} font-bold`} x="260" y="40" text-anchor="middle">AI Gateway</text>
    <text class={small} x="166" y="66">SSO</text>
    <text class={small} x="166" y="84">Rate limits</text>
    <text class={small} x="166" y="102">Guardrails</text>
    <text class={small} x="262" y="66">Cost per user and team</text>
    <text class={small} x="262" y="84">Model routing</text>
    <text class={small} x="262" y="102">Audit record</text>
    <rect class={node} x="400" y="6" width="112" height="46" rx="8" />
    <text class={text} x="456" y="33" text-anchor="middle">Azure AI Foundry</text>
    <rect class={node} x="400" y="104" width="112" height="46" rx="8" />
    <text class={text} x="456" y="131" text-anchor="middle">Anthropic</text>
    <rect class={node} x="170" y="190" width="180" height="46" rx="8" />
    <text class={text} x="260" y="210" text-anchor="middle">Audit log</text>
    <text class={small} x="260" y="225" text-anchor="middle">every call, every token, who and what for</text>
    <rect class={node} x="12" y="190" width="130" height="46" rx="8" />
    <text class={text} x="77" y="210" text-anchor="middle">MCP Gateway</text>
    <text class={small} x="77" y="225" text-anchor="middle">~20 servers, approvals</text>
    <circle class="fill-accent motion-reduce:hidden" r="4">
      <animateMotion dur="6s" repeatCount="indefinite" keyPoints="0;0.2;0.2;1" keyTimes="0;0.3;0.5;1" calcMode="linear" path="M92 70 H150 M370 70 H410 Q426 70 426 54 V35" />
    </circle>
    <text class={small} x="12" y="282">About 2 billion tokens a month take this path.</text>
  </svg>
  <figcaption class="mt-2.5 flex flex-wrap justify-between gap-3 text-sm text-muted">
    <span>The in-house gateway, third generation</span><span>Azure AI Foundry and Anthropic</span>
  </figcaption>
</figure>
```

Tailwind 4 generates `fill-*`/`stroke-*` from the theme colours; `text-[12px]` on SVG `<text>` sets `font-size`.
If `astro check`/build complains about `stroke-[1.5]`, use `[stroke-width:1.5]`.

- [ ] **Step 5: `Perspectives.astro`** (recruiters first, vertical tab list on desktop, definition list in the
recruiter panel; keep the radio + `:has` mechanism)

```astro
---
import { perspectives, recruiterFacts } from "../data/profile";
// Native radios pick the panel: works without JavaScript, and keyboard focus behaves as expected.
---

<section aria-labelledby="persp-title" class="persp grid gap-7">
  <div class="grid gap-2">
    <h2 id="persp-title" class="display text-3xl sm:text-4xl">What matters to your team?</h2>
    <p class="text-lg text-muted">The same career, read three ways. Start with yours.</p>
  </div>
  <div class="grid gap-6 md:grid-cols-[260px_1fr] md:gap-10">
    <fieldset class="flex flex-wrap gap-1 md:grid md:content-start">
      <legend class="sr-only">Choose a perspective</legend>
      {
        perspectives.map((p, i) => (
          <label class="cursor-pointer rounded-lg border border-transparent px-3.5 py-2.5 font-medium text-muted transition-colors hover:text-foreground has-checked:border-border has-checked:bg-surface has-checked:text-foreground has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent">
            <input type="radio" name="perspective" value={p.id} checked={i === 0} class="sr-only" />
            {p.label}
          </label>
        ))
      }
    </fieldset>
    {
      perspectives.map((p) => (
        <article data-panel={p.id} class="hidden max-w-2xl gap-3">
          <h3 class="display text-2xl sm:text-3xl">{p.headline}</h3>
          <p class="text-lg text-muted">{p.body}</p>
          {p.id === "recruiters" ? (
            <dl class="mt-2 grid grid-cols-[max-content_1fr] gap-x-5 gap-y-2 text-sm">
              {recruiterFacts.map((f) => (
                <>
                  <dt class="text-muted">{f.term}</dt>
                  <dd>{f.detail}</dd>
                </>
              ))}
            </dl>
          ) : (
            <ul class="grid gap-2">
              {p.points.map((point) => (
                <li class="flex gap-3">
                  <span class="mt-2.5 size-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                  {point}
                </li>
              ))}
            </ul>
          )}
        </article>
      ))
    }
  </div>
</section>

<style>
  .persp:has(input[value="recruiters"]:checked) [data-panel="recruiters"],
  .persp:has(input[value="leaders"]:checked) [data-panel="leaders"],
  .persp:has(input[value="security"]:checked) [data-panel="security"] {
    display: grid;
  }
</style>
```

- [ ] **Step 6: `CaseStudy.astro`, `PlatformList.astro`, `AboutStrip.astro`, `Cta.astro`**

`CaseStudy.astro`:

```astro
---
import { gateway } from "../data/profile";
---

<section aria-labelledby="case-title" class="grid gap-7">
  <div class="grid gap-2">
    <h2 id="case-title" class="display text-3xl sm:text-4xl">One gateway, three generations</h2>
    <p class="max-w-2xl text-lg text-muted">The company's single path to large language models, and the piece of work that best shows how I think.</p>
  </div>
  <div class="overflow-hidden rounded-2xl border border-border bg-surface">
    <div class="grid gap-2 border-b border-border p-7">
      <h3 class="display text-2xl">{gateway.title}</h3>
      <p class="max-w-3xl text-muted">{gateway.summary}</p>
    </div>
    <ol class="grid md:grid-cols-3">
      {
        gateway.generations.map((g, i) => (
          <li class:list={["grid content-start gap-2 border-t border-border p-6 md:border-t-0 md:border-l first:border-t-0 md:first:border-l-0", g.current && "bg-accent-soft"]}>
            <span class="text-sm font-bold text-accent tabular-nums">{g.current ? `Generation ${i + 1}, today` : `Generation ${i + 1}`}</span>
            <h4 class="font-bold">{g.name}</h4>
            <p class="text-sm text-muted">{g.note}</p>
          </li>
        ))
      }
    </ol>
    <dl class="grid border-t border-border md:grid-cols-3">
      {
        gateway.results.map((r) => (
          <div class="grid gap-0.5 border-t border-border px-7 py-4 first:border-t-0 md:border-t-0 md:border-l md:first:border-l-0">
            <dd class="order-1 text-2xl font-extrabold tracking-tight tabular-nums">{r.value}</dd>
            <dt class="order-2 text-sm text-muted">{r.label}</dt>
          </div>
        ))
      }
    </dl>
  </div>
</section>
```

`PlatformList.astro` (the five platforms after the gateway):

```astro
---
import { work } from "../data/profile";
const rest = work.filter((w) => w.title !== "AI Gateway");
---

<ul class="grid">
  {
    rest.map((item) => (
      <li class="grid gap-1 border-t border-border py-4 last:border-b md:grid-cols-[7.5rem_1fr_1.2fr] md:items-baseline md:gap-5">
        <span class="text-sm text-muted tabular-nums">{item.period}</span>
        <h3 class="font-bold">{item.title}</h3>
        <p class="text-sm text-muted">{item.result}</p>
      </li>
    ))
  }
</ul>
```

`AboutStrip.astro`:

```astro
---
import { bio, facts, resumeUrl } from "../data/profile";
import { person } from "../lib/site";

interface Props {
  // Rendered portrait size in px (square).
  size?: number;
}
const { size = 160 } = Astro.props;
const btn = "rounded-full border border-border bg-surface px-4 py-2 text-sm font-semibold";
---

<section aria-labelledby="about-title" class="grid gap-8 md:grid-cols-[auto_1fr] md:gap-10">
  <img
    src="/portrait.jpg"
    width="648"
    height="648"
    alt={`${person.name}, smiling, in a shirt and tie`}
    class:list={["aspect-square h-auto rounded-xl border border-border object-cover", size === 160 ? "w-40" : "w-[132px]"]}
  />
  <div class="grid gap-4">
    <h2 id="about-title" class="display text-3xl">About</h2>
    <p class="max-w-2xl text-lg">{bio}</p>
    <dl class="flex flex-wrap gap-6 text-sm text-muted">
      {
        facts.map((f) => (
          <div>
            <dt class="font-semibold text-foreground">{f.title}</dt>
            <dd>{f.detail}</dd>
          </div>
        ))
      }
    </dl>
    <div class="flex flex-wrap gap-2.5">
      <a href={resumeUrl} target="_blank" rel="noopener" class={btn}>Full résumé</a>
      <a href={person.sameAs[1]} rel="me noopener" class={btn}>GitHub</a>
    </div>
  </div>
</section>
```

Do not use Astro's `style:width` shortcut for the size: it compiles to an inline `style` attribute, which the CSP
forbids. The `class:list` above is the CSP-safe form; `height: auto` (`h-auto`) is what keeps the `height="648"`
attribute from stretching the image (the bug found during the mockup review).

`Cta.astro`:

```astro
---
import { contact } from "../data/profile";

interface Props {
  title: string;
  body: string;
}
const { title, body } = Astro.props;
---

<section class="grid gap-4 border-t border-border py-14">
  <h2 class="display text-3xl sm:text-4xl">{title}</h2>
  <p class="max-w-2xl text-muted">{body}</p>
  <p><a href={contact.href} rel="me noopener" class="inline-flex rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-accent-foreground">{contact.label}</a></p>
</section>
```

- [ ] **Step 7: `index.astro`** (replace)

```astro
---
import AboutStrip from "../components/AboutStrip.astro";
import Availability from "../components/Availability.astro";
import CaseStudy from "../components/CaseStudy.astro";
import Cta from "../components/Cta.astro";
import GatewayPath from "../components/GatewayPath.astro";
import Perspectives from "../components/Perspectives.astro";
import PlatformList from "../components/PlatformList.astro";
import { availability, contact, headline, intro, resumeUrl } from "../data/profile";
import Base from "../layouts/Base.astro";
import { ogImage } from "../lib/og";
import { person } from "../lib/site";
---

<Base title={person.name} type="profile" image={ogImage("home", Astro.locals.siteSettings.proPalette)}>
  <div class="mx-auto grid max-w-6xl gap-14 px-4 sm:px-6">
    <section class="grid items-center gap-12 pt-16 pb-6 lg:grid-cols-[1.05fr_1fr] lg:pt-20">
      <div class="grid gap-5">
        <h1 class="display text-5xl sm:text-6xl lg:text-7xl">{headline}</h1>
        <p class="max-w-xl text-lg text-muted">{intro}</p>
        <Availability text={availability} />
        <div class="flex flex-wrap gap-2.5">
          <a href={contact.href} rel="me noopener" class="rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-accent-foreground">{contact.label}</a>
          <a href={resumeUrl} target="_blank" rel="noopener" class="rounded-full border border-border bg-surface px-5 py-2.5 text-sm font-semibold">Read the résumé</a>
        </div>
      </div>
      <GatewayPath />
    </section>
    <div class="border-t border-border pt-14"><Perspectives /></div>
    <div class="grid gap-8 border-t border-border pt-14"><CaseStudy /><PlatformList /></div>
    <div class="border-t border-border pt-14 pb-2"><AboutStrip /></div>
    <Cta title="Hiring for a platform that has to work on Monday?" body="I'm happy to talk about the role, the stack, or how we moved from LiteLLM to an in‑house gateway." />
  </div>
</Base>
```

`ogImage` gains a second parameter in Task 10; until then call it as `ogImage("home")` and update here in
Task 10. Delete `StatusPanel.astro` (`git rm web/src/components/StatusPanel.astro`).

- [ ] **Step 8: Run tests, check, lint; restart; look**

Run: `cd web && env -u NODE_ENV pnpm vitest run && env -u NODE_ENV pnpm check && env -u NODE_ENV pnpm lint`
Then `env -u NODE_ENV aspire resource web restart` and
`curl -s http://localhost:4321/ | grep -c 'style="'` → `0` (CSP rule), and
`curl -s http://localhost:4321/ | grep -o '<h1[^>]*>[^<]*'` shows the headline.
Open `http://localhost:4321/` in Chrome DevTools at 1440 and 390; portrait measures 160×160; no horizontal scroll.

- [ ] **Step 9: Commit**

```bash
git add -A web/src/components web/src/pages/index.astro web/public/portrait.jpg web/tests/home.test.ts
git commit -m "Home: rebuild from mockup A (gateway path, perspectives, case study, about, contact)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Changelog page from mockup B

**Files:**

- Create: `web/src/pages/changelog.astro`, `web/src/components/RailEntry.astro`
- Modify: `web/src/lib/og.ts` (add the `changelog` card)
- Test: `web/tests/changelog.test.ts` (new), `web/e2e/public.spec.ts` (nav loop already includes Changelog)

**Interfaces:**

- Consumes: `career` (with `heading`, `summary`), `gateway`, `work`, `perspectives`, `recruiterFacts`, `facts`,
  `headline`-independent copy below, `Availability`, `contact`, `resumeUrl`.
- Produces: route `/changelog`; `RailEntry` props `{ year: string; now?: boolean; meta?: string; id?: string }`.

- [ ] **Step 1: Failing test** `web/tests/changelog.test.ts`

```ts
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { describe, expect, it } from "vitest";
import RailEntry from "../src/components/RailEntry.astro";

describe("RailEntry", () => {
  it("renders the year column and marks the current entry", async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(RailEntry, { props: { year: "2026", now: true, meta: "Manager" }, slots: { default: "<p>body</p>" } });
    expect(html).toContain("2026");
    expect(html).toContain("Manager");
    expect(html).toMatch(/data-now="true"/);
    expect(html).toContain("<p>body</p>");
  });
});
```

Run: `cd web && env -u NODE_ENV pnpm vitest run tests/changelog.test.ts` — Expected: FAIL.

- [ ] **Step 2: `RailEntry.astro`**

```astro
---
interface Props {
  // Year label in the rail column; empty string for an unlabelled entry (the perspectives).
  year: string;
  // Current entry: accent dot and foreground year.
  now?: boolean;
  // Small line above the heading (role and dates).
  meta?: string;
  id?: string;
}
const { year, now = false, meta, id } = Astro.props;
---

<section id={id} data-now={String(now)} class="contents">
  <div class:list={["relative border-r border-border pt-1 text-sm tabular-nums sm:text-base", now ? "text-foreground" : "text-muted"]}>
    <span class="display text-base font-normal sm:text-lg">{year}</span>
    <span
      aria-hidden="true"
      class:list={["absolute top-3 -right-[5px] size-2.5 rounded-full border-2", now ? "border-accent bg-accent" : "border-muted bg-background"]}
    />
  </div>
  <div class="grid content-start gap-3.5 pb-12 pl-5 sm:pl-10">
    {meta && <p class="text-sm text-muted">{meta}</p>}
    <slot />
  </div>
</section>
```

- [ ] **Step 3: `changelog.astro`**

```astro
---
import Availability from "../components/Availability.astro";
import Cta from "../components/Cta.astro";
import RailEntry from "../components/RailEntry.astro";
import { availability, career, contact, facts, gateway, perspectives, recruiterFacts, resumeUrl, work } from "../data/profile";
import Base from "../layouts/Base.astro";
import { ogImage } from "../lib/og";
import { person } from "../lib/site";

const [manager, senior, engineer, analyst] = career;
const period = (role: (typeof career)[number]) => `${role.title}, ${role.start.slice(-4)} to ${role.end?.slice(-4) ?? "now"}`;
const same = work.filter((w) => w.title !== "AI Gateway" && w.period === "2021 to now");
const link = "font-semibold underline decoration-accent decoration-2 underline-offset-4";
---

<Base title="Changelog" description="Seventeen years at The Aaron's Company, newest first: roles, platforms and what each one changed." image={ogImage("changelog", Astro.locals.siteSettings.proPalette)} type="profile">
  <div class="mx-auto max-w-6xl px-4 sm:px-6">
    <div class="grid grid-cols-[4.2rem_1fr] pt-10 sm:grid-cols-[7rem_1fr]">
      <RailEntry year="2026" now>
        <div class="grid gap-8 md:grid-cols-[minmax(0,46rem)_132px] md:justify-start md:gap-10">
          <div class="grid gap-5">
            <h1 class="display max-w-[14ch] text-5xl sm:text-6xl lg:text-7xl">
              Seventeen years keeping a 1,200&#8209;store company running. <em class="text-accent">Now its AI, too.</em>
            </h1>
            <p class="max-w-[52ch] text-xl">
              I lead infrastructure and company-wide AI adoption at The Aaron's Company: the AI Gateway that about 2 billion tokens a month pass through, the MCP platform behind it, and the Kubernetes, network and data-center estate underneath.
            </p>
            <Availability text={availability} />
            <div class="flex flex-wrap items-center gap-x-7 gap-y-4">
              <a href={contact.href} rel="me noopener" class={link}>{contact.label}</a>
              <a href={resumeUrl} target="_blank" rel="noopener" class="font-medium text-muted underline decoration-border decoration-2 underline-offset-4">Read the résumé</a>
            </div>
          </div>
          <img src="/portrait.jpg" width="648" height="648" alt={`${person.name}, smiling, in a shirt and tie`} class="aspect-square h-auto w-28 object-cover md:w-[132px]" />
        </div>
        <dl class="mt-4 grid grid-cols-2 gap-x-10 gap-y-3 text-sm sm:grid-cols-3">
          {
            facts.map((f) => (
              <div>
                <dt class="display text-2xl font-normal">{f.title}</dt>
                <dd class="text-muted">{f.detail}</dd>
              </div>
            ))
          }
        </dl>
      </RailEntry>

      <RailEntry year="" id="for-you">
        <div class="persp grid max-w-2xl gap-3">
          <fieldset class="flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
            <legend class="float-left mr-1 text-muted">Read this as a</legend>
            {
              perspectives.map((p, i) => (
                <label class="cursor-pointer border-b-2 border-transparent pb-0.5 text-muted has-checked:border-accent has-checked:text-foreground has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent">
                  <input type="radio" name="read-as" value={p.id} checked={i === 0} class="sr-only" />
                  {p.label.toLowerCase()}
                </label>
              ))
            }
          </fieldset>
          {
            perspectives.map((p) => (
              <article data-panel={p.id} class="hidden gap-2.5">
                <h3 class="display text-2xl">{p.headline}</h3>
                <p class="text-muted">{p.body}</p>
                {p.id === "recruiters" && (
                  <dl class="grid grid-cols-[max-content_1fr] gap-x-5 gap-y-1.5 text-sm">
                    {recruiterFacts.map((f) => (
                      <>
                        <dt class="text-muted">{f.term}</dt>
                        <dd>{f.detail}</dd>
                      </>
                    ))}
                  </dl>
                )}
              </article>
            ))
          }
        </div>
      </RailEntry>

      <RailEntry year="2021 to now" now meta={period(manager)} id="work">
        <h2 class="display text-3xl">{manager.heading}</h2>
        <p class="max-w-[62ch]">{manager.summary}</p>
        <dl class="grid max-w-[62ch] border-t border-border">
          {
            gateway.generations.map((g) => (
              <div class="grid gap-1 border-b border-border py-3 text-sm sm:grid-cols-[9rem_1fr] sm:gap-4">
                <dt class:list={["font-semibold", g.current && "text-accent"]}>{g.name}</dt>
                <dd class="text-muted">{g.note}</dd>
              </div>
            ))
          }
        </dl>
        <h3 class="display mt-2 text-xl">In the same period</h3>
        <dl class="grid gap-1.5 text-sm">
          {
            same.map((item) => (
              <div class="grid gap-1 sm:grid-cols-[9rem_1fr] sm:gap-3">
                <dt class="text-muted">{item.title}</dt>
                <dd>{item.result}</dd>
              </div>
            ))
          }
        </dl>
      </RailEntry>

      <RailEntry year="2015" meta={period(senior)} id="career">
        <h2 class="display text-3xl">{senior.heading}</h2>
        <p class="max-w-[62ch]">{senior.summary}</p>
      </RailEntry>

      <RailEntry year="2012" meta={period(engineer)}>
        <h2 class="display text-3xl">{engineer.heading}</h2>
        <p class="max-w-[62ch]">{engineer.summary}</p>
      </RailEntry>

      <RailEntry year="2009" meta={period(analyst)}>
        <h2 class="display text-3xl">{analyst.heading}</h2>
        <p class="max-w-[62ch] text-muted">{analyst.summary}</p>
      </RailEntry>
    </div>

    <!-- The closing entry keeps the rail's text column so the grid holds after the rail ends. -->
    <div class="border-t border-foreground pl-[calc(4.2rem+1.25rem)] sm:pl-[calc(7rem+2.5rem)]">
      <Cta title="If a platform has to work on Monday, let's talk." body="About the role, the stack, or how we went from LiteLLM to an in‑house gateway." />
    </div>
  </div>
</Base>

<style>
  .persp:has(input[value="recruiters"]:checked) [data-panel="recruiters"],
  .persp:has(input[value="leaders"]:checked) [data-panel="leaders"],
  .persp:has(input[value="security"]:checked) [data-panel="security"] {
    display: grid;
  }
</style>
```

Add to `ogCards` in `og.ts`:

```ts
  changelog: { title: "Seventeen years, one company, newest first.", subtitle: "Roles, platforms and what each one changed" },
```

- [ ] **Step 4: Run tests, check, lint; restart; look**

Run: `cd web && env -u NODE_ENV pnpm vitest run && env -u NODE_ENV pnpm check && env -u NODE_ENV pnpm lint`
Then `env -u NODE_ENV aspire resource web restart`;
`curl -s -o /dev/null -w "%{http_code}" http://localhost:4321/changelog` → `200`;
`curl -s http://localhost:4321/changelog | grep -c 'style="'` → `0`;
`curl -s http://localhost:4321/sitemap.xml | grep -c changelog` → `1`.
In Chrome: portrait 132×132 at 1440 and 112×112 at 390; closing heading starts at the same x as entry text.
Click Home → Changelog in Chrome (not reduced-motion) and confirm the header stays while the body cross-fades.

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/changelog.astro web/src/components/RailEntry.astro web/src/lib/og.ts web/tests/changelog.test.ts
git commit -m "Changelog: new page from mockup B on a 2026-to-2009 rail

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Work and About in the new language

**Files:**

- Modify: `web/src/components/WorkCard.astro`, `web/src/pages/work.astro`, `web/src/pages/about.astro`,
  `web/src/pages/writing/index.astro`, `web/src/pages/writing/[slug].astro`

- [ ] **Step 1: `WorkCard.astro` becomes a row** (period, title, summary, result; no pills, no mono eyebrow)

```astro
---
import type { WorkItem } from "../data/profile";

interface Props {
  item: WorkItem;
}
const { item } = Astro.props;
---

<article class="grid gap-2 border-t border-border py-6 md:grid-cols-[7.5rem_1fr] md:gap-6">
  <p class="text-sm text-muted tabular-nums">{item.period}</p>
  <div class="grid gap-2">
    <h3 class="display text-2xl">{item.title}</h3>
    <p class="max-w-[62ch] text-muted">{item.summary}</p>
    <p class="max-w-[62ch] text-sm font-semibold">{item.result}</p>
  </div>
</article>
```

- [ ] **Step 2: `work.astro`**: wrap the list in `<div class="grid border-b border-border">` (single column), change
`<h1>` to `class="display text-4xl sm:text-5xl"`, remove `text-balance`/`tracking-tight` duplicates. Pass the live
palette to `ogImage("work", Astro.locals.siteSettings.proPalette)` (Task 10 adds the parameter; use the
one-argument form until then).

- [ ] **Step 3: `about.astro`**: replace the three mono eyebrows (`Changelog`, `Education`, `Volunteer`) with
sentence-case `<p class="text-sm text-muted">` lines; `<h1>`/`<h2>` get `class="display …"`; the date span gets
`whitespace-nowrap` and renders `{role.start.slice(-4)} – {role.end?.slice(-4) ?? "now"}` (years only, so
"2015 – 2021" fits the 8.5rem column); the résumé link gets `target="_blank" rel="noopener"`; the skills chips stay.

- [ ] **Step 4: Writing pages**: `<h1>` → `class="display …"`; nothing else changes.

- [ ] **Step 5: Run check, lint, tests; restart; look**

Run: `cd web && env -u NODE_ENV pnpm check && env -u NODE_ENV pnpm lint && env -u NODE_ENV pnpm vitest run`
Then `env -u NODE_ENV aspire resource web restart`; in Chrome at 1440: `/about` dates on one line; `/work` rows
even; `/writing` heading in the display face; switch Serif in the footer and confirm headings change on all pages.

- [ ] **Step 6: Commit**

```bash
git add web/src/components/WorkCard.astro web/src/pages/work.astro web/src/pages/about.astro web/src/pages/writing
git commit -m "Work, About, Writing: rows instead of cards, display headings, no eyebrows; fix About date wrap

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Share cards follow the live palette; theme-color

**Files:**

- Modify: `web/src/lib/og.ts`, `web/src/pages/og/[slug].png.ts`, `web/src/components/Seo.astro`,
  `web/src/layouts/Base.astro`, the four pages calling `ogImage`
- Test: `web/tests/og.test.ts`, `web/tests/seo.test.ts`

- [ ] **Step 1: Failing tests.** In `og.test.ts` add:

```ts
import { ogImage } from "../src/lib/og";

it("versions the card URL by the palette it will render with", () => {
  expect(ogImage("home", "paper")).toBe("/og/home.png?v=paper");
});
```

and mock settings for the route:

```ts
vi.mock("../src/lib/site-settings", () => ({ getSiteSettings: vi.fn(async () => ({ proPalette: "paper" })) }));
```

(import `vi` from vitest; the PNG test keeps passing). In `seo.test.ts` add:

```ts
  it("sets theme-color for light and dark from the palette", async () => {
    const html = await renderSeo({ title: "Jason Matherly", themeColors: { light: "#f3f4f1", dark: "#0e1211" } });
    expect(html).toContain('<meta name="theme-color" media="(prefers-color-scheme: light)" content="#f3f4f1">');
    expect(html).toContain('<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0e1211">');
  });
```

Run: `cd web && env -u NODE_ENV pnpm vitest run tests/og.test.ts tests/seo.test.ts` — Expected: FAIL.

- [ ] **Step 2: `og.ts`**

```ts
import type { ProPalette } from "../theme/palettes";
// … ogCards unchanged (plus `changelog` from Task 8) …

// Cards render in the site's current Pro palette (set on /admin); the version parameter makes social caches
// refetch when an admin changes it.
export const ogImage = (slug: keyof typeof ogCards & string, palette: ProPalette) => `/og/${slug}.png?v=${palette}`;
```

Remove the `SITE_DEFAULTS` import.

- [ ] **Step 3: `og/[slug].png.ts`**: replace `import { SITE_DEFAULTS } …` with
`import { getSiteSettings } from "../../lib/site-settings";` and
`const c = paletteColors((await getSiteSettings()).proPalette, "dark");`.

- [ ] **Step 4: `Seo.astro`**: add an optional prop `themeColors?: { light: string; dark: string }` and render

```astro
{themeColors && <meta name="theme-color" media="(prefers-color-scheme: light)" content={themeColors.light} />}
{themeColors && <meta name="theme-color" media="(prefers-color-scheme: dark)" content={themeColors.dark} />}
```

- [ ] **Step 5: `Base.astro`**: compute and pass them

```astro
import { paletteColors } from "../theme/colors";
const themeColors = { light: paletteColors(palette, "light").bg, dark: paletteColors(palette, "dark").bg };
---
<Seo {...seo} themeColors={themeColors} />
```

- [ ] **Step 6: Pages**: `index.astro`, `work.astro`, `about.astro`, `writing/index.astro`, `changelog.astro` call
`ogImage("<slug>", Astro.locals.siteSettings.proPalette)`.

- [ ] **Step 7: Run everything; verify the live card**

Run: `cd web && env -u NODE_ENV pnpm vitest run && env -u NODE_ENV pnpm check`
Then `env -u NODE_ENV aspire resource web restart`;
`curl -s http://localhost:4321/ | grep -o 'og:image" content="[^"]*"'` ends in `?v=<the /admin palette>`;
`curl -s http://localhost:4321/ | grep -c 'name="theme-color"'` → `2`.

- [ ] **Step 8: Commit**

```bash
git add web/src/lib/og.ts web/src/pages web/src/components/Seo.astro web/src/layouts/Base.astro web/tests/og.test.ts web/tests/seo.test.ts
git commit -m "Share cards use the /admin palette; theme-color from the active palette

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: Brand mark at header size (decision with Jason)

**Files:**

- Modify: `web/src/components/Logo.astro`; possibly add `web/public/m-logo.svg`

The Brand palette's header mark is `m-logo.png` (140 px) scaled to 32 px and reads muddy (audit finding 10).
This needs the vector source of the brand mark; it cannot be fixed by code alone.

- [ ] **Step 1: Ask Jason** (one question): "Do you have the brand 'M' mark as SVG or a large PNG/PDF? If not,
is it acceptable to show the Pro monogram with the Signal accent dot in the header under Brand, and keep
`m-logo.png` only at large sizes (auth card)?"

- [ ] **Step 2a (vector supplied):** save as `web/public/m-logo.svg`, swap the `<img src="/m-logo.png">` in
`Logo.astro` for `<img src="/m-logo.svg" …>`, keep `width`/`height` attributes.

- [ ] **Step 2b (fallback accepted):** in `Logo.astro`, render the monogram for both themes when `size` is
`size-8` (header), and the raster only for larger sizes:

```astro
const header = size === "size-8";
---
<span class="inline-flex" role="img" aria-label="Matherly">
  {!header && <img src="/m-logo.png" alt="" width="140" height="140" class:list={["logo-brand", size]} />}
  <span class:list={[header ? "" : "logo-pro", "text-foreground [&>svg]:size-full", size]} set:html={proMark} />
</span>
```

- [ ] **Step 3: Check and commit**

Run: `cd web && env -u NODE_ENV pnpm check`; in Chrome under Brand the header mark is crisp at 2×.

```bash
git add web/src/components/Logo.astro web/public
git commit -m "Brand mark: crisp at header size

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12: Documentation

**Files:**

- Modify: `.claude/rules/web-architecture.md` (file map), `AGENTS.md` (Code Conventions + Rules), `docs/deployment.md`
  if it mentions the theme toggle

- [ ] **Step 1: File map** — add lines for `src/components/ModeToggle.astro`, `ThemeControls.astro`,
`GatewayPath.astro`, `CaseStudy.astro`, `PlatformList.astro`, `AboutStrip.astro`, `Cta.astro`, `Availability.astro`, `RailEntry.astro`,
`src/pages/changelog.astro`, `src/lib/theme-cookie.ts`, `public/portrait.jpg`; remove `ThemeToggle.astro` and
`StatusPanel.astro`; note `typeface` in the `site-settings.ts` line.

- [ ] **Step 2: AGENTS.md** — in Code Conventions add: "Headings use the `.display` class (face, weight and tracking
follow `data-type`); body text is Geist. No inline `style` attributes (CSP)." In Rules add: "Theme = palette ×
mode × typeface; cookies `mn-theme`, `mn-mode`, `mn-type`; admin defaults on /admin. Page transitions are native
cross-document view transitions (`@view-transition` in global.css); don't add `<ClientRouter />`." Keep within 120
columns; run `markdownlint-cli2` on the changed files.

- [ ] **Step 3: Commit** (docs only: no `/verify`)

```bash
git add .claude/rules/web-architecture.md AGENTS.md docs
git commit -m "Docs: theme model, display headings, new components and the changelog page

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 13: Verification pass

**Files:** none (fixes found here go back into the owning task's files with their own commits)

- [ ] **Step 1: Full local check**

Run `/verify`. Expected: every step PASS (AppHost lint/tsc, Markdown, actionlint, web check/lint/test/build, Aspire
smoke, Playwright).

- [ ] **Step 2: Chrome DevTools review** (chrome-devtools MCP against `http://localhost:4321`), for each of `/` and
`/changelog`, at 1440×900 and 390×844 (emulate a plain window, not `mobile`, if the dev server lacks the viewport
meta: it does have it, so `mobile` is fine):
  - light and dark; Brand (Signal) and Pro with the /admin palette set to Flare and then Paper; Sans and Serif.
  - Assert via `evaluate_script`: `document.documentElement.scrollWidth <= clientWidth`; portrait
    `getBoundingClientRect()` is 160×160 / 128×128 (home) and 132×132 / 112×112 (changelog);
    `getComputedStyle(h1).fontFamily` contains "Newsreader" when `data-type="serif"`.
  - Emulate `prefers-reduced-motion: reduce` and confirm the pulse circle is hidden and the navigation shows no
    cross-fade.
  - Lighthouse (navigation, desktop) on both pages: Accessibility 100, Best Practices 100.
  - Screenshots to `out/ui-audit/final/` for the record.

- [ ] **Step 3: Contrast on the live page** — run the audit's computed-style contrast script (from the report's
method) on `/` in Paper light and dark; worst ratio ≥ 4.5.

- [ ] **Step 4: Report** to Jason: what passed, measured numbers, anything that needed a fix (and its commit), and the
two open decisions (availability wording; whether Changelog replaces About). Do not push.
