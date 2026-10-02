# Home and Changelog redesign: design

Date: 2026-10-02. Source: the UI audit of 2026-10-01 and its two approved mockups ("A · Signal path" and
"B · Changelog"). This spec is what the implementation plan argues from.

## Goal

Make matherly.net work as a hiring site: a visitor (recruiter first, engineer second) can see who Jason is,
what he built, and how to reach him within one screen, and the site has a visual identity of its own.

## Decisions (made with Jason)

1. Mockup A becomes the home page. Mockup B becomes a new page, `/changelog`, with its own nav item; whether it
   later replaces About is decided after both are live.
2. Home ↔ Changelog uses browser-native cross-document view transitions: the header holds still, the content
   cross-fades and the palette and typeface re-colour over about 400 ms. Reduced-motion disables the animation.
   Browsers without support navigate normally. No `<ClientRouter />`.
3. The theme model gains a typography axis, `typeface: "sans" | "serif"`, beside `theme` and `mode`: a visitor
   cookie (`mn-type`), an admin default on /admin, and a `data-type` attribute on `<html>`. The serif display
   face is Newsreader (variable, from `@fontsource-variable/newsreader` through the existing npm font provider).
   B's colours are a new Pro palette, `paper` ("Paper & Evergreen"). A is Titanium & Flare + Geist: no new palette.
   The changelog page may later be pinned to the serif; the attribute makes that a one-line change.
4. Contact is LinkedIn only: "Let's talk" in the header, "Message me on LinkedIn" in page bodies. No email.
5. Portrait: Jason's 648×648 photo at `web/public/portrait.jpg`, shown square (160 px on home, 132 px on the
   changelog). A larger original can replace the file later without code changes.
6. The "open to" availability line renders only when Jason supplies the wording (`availability` in
   `profile.ts`, `null` until then). No placeholder copy ships.

## Pages

### Home `/`

Sections, top to bottom, all from `src/data/profile.ts`:

1. Hero: headline, intro paragraph, optional availability line, actions ("Message me on LinkedIn",
   "Read the résumé" in a new tab), and the gateway request-path figure (inline SVG: person → AI Gateway
   [SSO, rate limits, guardrails / cost per user and team, model routing, audit record] → Azure AI Foundry and
   Anthropic; MCP Gateway → audit log). One pulse travels the wires on a 6 s loop; hidden under reduced motion.
   Labels name only facts from the résumé.
2. "What matters to your team?": the three perspectives, recruiters first, with the recruiter panel carrying a
   definition list of screening facts (title, team, location, education, languages). Native radios + CSS `:has`,
   as today.
3. "One gateway, three generations": the AI Gateway case study (LiteLLM → Azure API Management → in-house) with
   three results (~2 billion tokens a month; near-zero projected licensing cost; every call attributed, limited,
   logged), then the compact list of the other five platforms with their period.
4. About strip: portrait, bio paragraph, three facts (Atlanta, Kennesaw State, Spoons of Salt), résumé and GitHub.
5. Closing: "Hiring for a platform that has to work on Monday?" + LinkedIn action.

### Changelog `/changelog`

A two-column rail: year column (with a dot per entry on a vertical rule) and body column. Entries, newest first:

1. 2026 (now): headline "Seventeen years keeping a 1,200-store company running. Now its AI, too." (the last
   sentence italic in the accent), intro, optional availability line, actions, portrait, three facts.
2. "Read this as a…" perspectives (same data as home, tab-style labels).
3. 2021 to now: Manager, Infrastructure Services. The gateway's three generations as a definition list, then
   "In the same period": MCP, agents, Kubernetes, rollouts, team.
4. 2015: Sr. Infrastructure Engineer: data center, DR, SD-WAN, Azure, Always-On VPN.
5. 2012: Network Engineer: addressing plan, firewall migrations, PAM.
6. 2009: Network Analyst: store connectivity, SonicWALL, degree.
7. Closing entry aligned to the body column: "If a platform has to work on Monday, let's talk." + LinkedIn.

Headings on this page use the display face (`.display`), which is Geist or Newsreader depending on `data-type`.

### Other pages

Work, About, Writing, auth pages and 404 keep their content and layout. They inherit the new header, footer,
tokens and view-transition CSS. Two audit fixes land on About: the timeline date column no longer wraps
(`whitespace-nowrap`), and the résumé link opens in a new tab with `rel="noopener"`.

## Chrome

- Header: mark + name (home link), main nav (Work · Changelog · About; Writing hidden from the nav until a post is
  published, `nav: false` in `publicRoutes`), the light/dark/system control, "Let's talk" (LinkedIn). The header
  carries `view-transition-name: site-header`.
- Footer: © line; Brand/Pro switch; Sans/Serif switch; LinkedIn, GitHub, RSS; Sign in (or Account when signed in).
- Minimal chrome (auth pages, 404): unchanged apart from inheriting the new header's mode control.

## Theme model

- `palettes.ts`: `TYPEFACES = { sans: "Geist", serif: "Newsreader" }`, `Typeface`, `TYPE_COOKIE = "mn-type"`,
  `SiteThemeDefaults.typeface`, `ResolvedTheme.typeface`, `resolveTheme` reads the `type` cookie and falls back to
  the site default; `isTypeface()`. `SITE_DEFAULTS.typeface = "sans"`.
- `palettes.css`: new `:root[data-palette="paper"]` block (13 `light-dark()` tokens; test-enforced).
- `global.css`: `--display-face`, `--display-weight`, `--display-tracking` set on `:root` for sans and overridden
  under `:root[data-type="serif"]`; a `.display` component class applies them; `@view-transition { navigation:
  auto }`, 400 ms root animation, reduced-motion override.
- `astro.config.mjs`: Newsreader Variable font family, `--font-newsreader`, weights `200 800`, styles normal and
  italic, fallbacks `Georgia, serif`. `Base.astro` loads it without preload and stamps `data-type`.
- `site_settings`: new column `typeface text NOT NULL DEFAULT 'sans'` (generated migration). `fromRow`,
  `saveSiteSettings`, `parseSettingsForm`, /admin form and tests follow.
- Visitor controls: `ModeToggle.astro` (header) and `ThemeControls.astro` (footer: theme + typeface). The
  client script sets `data-palette`/`data-type`, swaps icon links for Brand/Pro as today, and writes cookies.
- Colour contrast is enforced by a test: for every palette and side, accent on bg ≥ 4.5:1, accent-ink on accent
  ≥ 4.5:1, muted on bg ≥ 4.5:1. Palettes that fail are adjusted (the audit found Signal dark accent at 4.18:1).

## Share cards and metadata

- `ogImage(slug, palette)` takes the live Pro palette; pages pass `Astro.locals.siteSettings.proPalette`, and
  `/og/[slug].png` reads `getSiteSettings()` instead of `SITE_DEFAULTS` (audit finding 11). New card `changelog`.
- `<meta name="theme-color">` for light and dark from the active palette's `--bg`, via `paletteColors()`.

## Out of scope

Replacing About with the changelog; refining the gateway animation beyond the mockup; a visitor-selectable Pro
palette (it stays an admin default); publishing Writing posts.

## Verification

`/verify` (lint, type-check, Markdown, tests, build, Aspire smoke, Playwright), then a Chrome DevTools review of
`/` and `/changelog` at 1440 and 390 px, light and dark, sans and serif, Brand and Pro (Flare and Paper), with
measured portrait sizes, no horizontal overflow, Lighthouse accessibility 100, and the contrast test green.
