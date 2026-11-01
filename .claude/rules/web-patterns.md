---
paths:
  - "web/**"
---

# Web app patterns

How the site is put together and why. The file-by-file map is `web-architecture.md`.

- Styling: Tailwind utilities on design tokens only (`bg-surface`, `text-muted`, `bg-accent`…); the default
  Tailwind palette is disabled. New palettes need a block in `palettes.css` and a key in `palettes.ts` (a test
  enforces the match). Each palette, light and dark, must keep text at WCAG AA (4.5:1): accent and muted on bg,
  surface and accent-soft, muted on surface-2, and accent-ink on accent; `theme.test.ts` fails otherwise.
- CSP (`security.csp` in `astro.config.mjs`, sent as a header; `astro dev` skips it, so check a build): no inline
  `style` attributes, `on*=` handlers or unhashed inline scripts. Third-party origins are added per request with
  `Astro.csp` (see Telemetry.astro). Code blocks use Prism (token classes, colored from the palette in
  global.css), not Shiki, whose inline styles the CSP blocks. Post tables take no column alignment (`:---`
  renders `style="text-align:…"`; `content.test.ts` enforces it). A post that embeds a component is `.mdx`.
- Size images with classes (`w-28 h-auto aspect-square`), never a `style` attribute (string or object); give `<img>`
  its real `width`/`height` for layout shift and `h-auto` so they don't stretch it. SVG figures take color from
  `fill-*`/`stroke-*` token utilities, not `fill="#…"` or `style`.
- Shared Tailwind class strings live in `web/src/lib/form.ts` (`inlineLink` for prose links, `choice` for radio-chip
  labels, `badge` for small tag pills, `figureCard`/`figureScroll`/`figureNode`/`figureBox`/`figureWire` for SVG
  figures); reuse them rather than copying the classes.
- Account forms handled by page script still declare `method="post"`, so a submit that beats the script can't put
  the password in a query string.
- Public pages come from `publicRoutes` in `src/lib/site.ts`; the public origin is `BETTER_AUTH_URL`.
- Site settings (`site_settings` row, edited on /admin) carry the default theme, Pro palette and display typeface
  (`sans`/`serif`). New columns need a DB default so the existing row migrates; `fromRow()` in `site-settings.ts`
  falls back to `SITE_DEFAULTS` for unknown values, and `parseSettingsForm()` rejects them. The /admin form reads the
  row with `readSiteSettings()`, which throws on a database error: `getSiteSettings()` falls back to defaults, and a
  form filled from those would save them over the real row.
- The display typeface is `data-type` on `<html>` (set in `Base.astro`); page and section titles use the `.display`
  class, which reads `--display-face` (small card and list headings stay Geist bold; Markdown post h2s in
  `.prose-content` read the same variables, h3 stays Geist). All three families (Geist, Geist Mono, Newsreader) go
  through Astro's local font provider on the `@fontsource-variable/*` Latin woff2 files; avoid the npm provider: it
  parses one CSS file per family (none declares both Newsreader's normal and italic), and with unifont 1.x it returns
  `file://` URLs that Astro's font fetcher passes to `fetch()`, which fails (checked on astro 7.4.2). Newsreader is
  preloaded only when serif is active. Cross-document view transitions are on (`@view-transition` in `global.css`); the
  header keeps its own `view-transition-name`. `Base.astro` marks the outgoing page's transition `ready` promise handled
  on `pageswap`: Safari rejects it at teardown and browser Sentry reported the unhandled rejection (WebKit bug 289078).
- Visitor theme choices are cookies written by page script (`remember()` in `lib/theme-cookie.ts`): the header's
  `ModeToggle` sets color mode; the footer's `ThemeControls` sets Brand/Pro and Sans/Serif. The server reads them back
  into `Astro.locals.theme`.
- Share cards follow the site theme: pages call `ogImage(slug, siteSettings)` and `cardPalette()` picks Signal for a
  Brand site, else the Pro palette; the `?v=` palette key makes social caches refetch, and the route renders the
  palette it names (so a replica with older cached settings can't cache the wrong card under it). `Seo.astro` takes
  `themeColor` (a string for a forced mode, a light/dark pair when following the system; `themeColorFor()` decides)
  and emits `theme-color` meta tags.
- Nav visibility is the `nav` flag in `publicRoutes`; the same flag drives the footer's page links and the 404 page's
  links. The header's "Let's talk" button links to `person.sameAs[0]`; RSS, Privacy and Account/Sign in live in the
  footer.
- Each page has one job, so facts aren't retold across pages: home is the overview (perspectives, case study),
  /changelog the timeline (recruiter facts, roles with highlights and their year-dated milestones; the milestones
  name what happened when, and leave the how and the results to /work),
  /work the platforms (`workGroups`, newest first; the gateway generations), /about the person. Every inner page
  links to another from its body (`pages.test.ts`).
- The home perspective panels share one grid cell and switch with `visibility` (not `display`), so the block keeps the
  tallest panel's height and the page below doesn't jump; the radio `:has()` rules in `Perspectives.astro` only flip
  visibility. The hero grid is `1fr / 1.15fr` so the figure draws near full size.
- Owner-supplied wording stays `null` in `profile.ts` until the owner provides it, and the page renders it only when
  set; don't write placeholder copy. `availability` is the owner's own sentence, also on his LinkedIn summary.
- `person` in `lib/site.ts` feeds the Person JSON-LD in `Seo.astro` (`jobTitle`, `worksFor`, `knowsAbout`; only
  `knowsAbout` is not shown on a page, and `employer.name` in `profile.ts` reuses `worksFor`; it carries no
  `alumniOf`: education is not published anywhere, by the owner's decision). `profile.ts` `intro` is
  a list of paragraphs where `*word*` marks emphasis (home page splits on `*`); `og.ts` reuses `headline` for the home
  card, swapping U+2011 (non-breaking hyphen, which keeps "15,000‑person" together) for "-": the card font lacks it.
  `sameAs` holds LinkedIn only (the footer and JSON-LD read it).
- `aboutHeadline` in `profile.ts` is /about's h1, its share card title (`og.ts`) and the home recruiters headline.
  `currentTitle` (not exported) feeds `career[0].title`, the recruiter facts and the recruiters perspective, so a
  retitle is one edit. `BANNED` (`tests/banned.ts`: retired claims such as "Manager of Infrastructure", "nearly 17",
  SLOs, EKS) fails `pages.test.ts` on /, /about, /changelog, /work, /playground, the profile data and the share cards,
  and `content.test.ts` on writing posts. /about's header carries the portrait
  and the availability line (/changelog's header has both; home has the line in its hero and the portrait in
  `AboutStrip`), and its skills are ruled rows with a label column like /work's: group name, then pills.
- All three portraits (/about, /changelog, home `AboutStrip`) are `Portrait.astro`, with a 320w and a 648w `srcset`.
  A caller that changes the width class passes the matching `sizes` with it (the props type requires both or
  neither); `lazy` adds `loading="lazy"` and `decoding="async"`. /about's is eager (above the fold); the other two are
  lazy, so a phone never downloads the one /changelog hides below `md`. `pages.test.ts` pins this.
- The home gateway figure (`GatewayPath.astro`), its engine and its SVG snapshots: see the "Gateway figure" section of
  `.claude/rules/web-architecture.md`.
- /playground is a browser simulation of the gateway, with a live path when `PLAYGROUND_MODEL_URL` is set. Live, the
  page POSTs the visitor's own request to `/api/playground`, and the server checks it, sends it to a self-hosted
  model and streams the answer back. The scenario chips and the no-script replay stay simulated in both modes.
  `lib/playground.ts` is pure and shared by the SSR replay, the page script, the server and the tests; every invented
  value lives in its `SIM` and is labelled demo or example on the page. The live path's real values live in its
  `LIVE`, except `PROMPT_MAX` beside it, and `BODY_MAX`, `BODY_MS`, `IN_FLIGHT_MAX` and the SQL's hour and day windows
  in `lib/playground-io.ts`. That file is server-only (the `playground_call` row, the model fetch, the stream). The
  page script must not import it. Prompt text must never be bound to a query or logged (a failed query's error
  quotes its parameters).
  A live "routed" decision's target is a branded `LiveTarget` (`playground.ts`) that only `liveModel()` makes, so the
  page shows the model id the call really used.
  `data/gateway.ts` is the one list of gates, callers and targets that the home figure and the playground share.
  The scenario chips switch panels with generated CSS (`scenarioCss()`, an inline `<style>` whose hash
  `GatewayConsole.astro` registers with `Astro.csp`). Without script each panel shows its scenario's `replay()`
  and the log shows `RECORDED_TOUR`.
  A model-on E2E run reads and seeds `playground_call` through the stack's `APPDB_URI` and, when it ends, deletes
  every row created while it ran (any other live call on that stack included), so runs don't use up the 300-a-day site
  cap. A run killed midway leaves its rows: inside the site-daily test, 300 seeded seated rows that refuse every local
  live call until the next model-on run deletes them or you run
  `delete from playground_call where visitor = 'e2e-seed'`.
- The writing post on the three gateway generations draws the two retired ones with `GatewayMap.astro` (static SVG,
  one `generation` prop; data in `data/gateway-generations.ts`). Its geometry is `lib/gateway-map.ts`, pure: `layout()`
  measures labels with Geist advance widths and throws, naming the label, when text would not fit its box or would
  cross a lane, node, label or region edge, so a copy edit that overflows fails `gateway-map.test.ts` rather than
  rendering badly. `W` (600) must match the component's `min-w-[600px]`; below `sm` it scrolls inside its card (an
  edge fade and a "Swipe" caption say so), where `GatewayPath` draws its stacked frame instead.
- Vitest sees an empty `writing` collection on a clean checkout (the content store exists only after a dev server
  or build has synced it), so which posts the feed and sitemap carry is asserted in `e2e/public.spec.ts`.
- Theme = palette × mode × typeface: visitor cookies `mn-theme`, `mn-mode`, `mn-type` over the /admin defaults (mode
  has none; it defaults to `system`). Page transitions are native cross-document view transitions (`@view-transition`
  in `global.css`); don't add `<ClientRouter />`. Page and section titles take `.display`; body text is always Geist.
