---
paths:
  - "web/src/components/GatewayPath.astro"
  - "web/src/components/GatewayLabel.astro"
  - "web/src/lib/gateway-path.ts"
  - "web/src/lib/gateway-map.ts"
  - "web/src/data/gateway.ts"
  - "web/tests/gateway-path.test.ts"
  - "web/tests/home.test.ts"
  - "web/tests/__snapshots__/gateway-path-*.svg"
---

# Home gateway figure

- The home gateway figure (`GatewayPath.astro`) animates with SMIL, not script or inline style, so the CSP holds. It
  renders `FIGURES` from `lib/gateway-path.ts`, `draw()` of `FRAMES.wide` (`hidden sm:block`) and `FRAMES.stacked`
  (`phone: true`, so `sm:hidden` and no wider than `PHONE_MAX_W`, 246; 240 units wide: callers on top, the gateways as
  columns of checks, targets below, the audit log a bar at the bottom), each with its own ids and `role="img"`. A
  `Figure` is render-ready, so `GatewayPath.astro` and `GatewayLabel.astro` do no math (`GatewayLabel` takes a label's
  classes from `FONT[tone].class`; the tones are `bold15`, `bold13`, `text12` and `text11`, and `Frame.names` picks the
  callers' and targets'), and its `motion` object is the only part under `motion-reduce:hidden`. The engine works in
  flow coordinates, so both frames share one requests table and `SPEED`, and pulse timings are computed there from
  lane lengths. `Rect`, `Point`, `Segment`, `overlaps()`, `path()` and the Geist `width()` come from `gateway-map.ts`.
  `draw()` wraps a name onto two lines or throws naming it; `check()` throws when a label leaves its box or touches
  another label, a box, a lane or a check's dot (the drawn r=6 ring, under the same `CLEAR`), a check sits off its
  line, two boxes overlap, a gateway line leaves its box or passes through another, an audit drop bends diagonally
  (`path()` would draw it as a plain H), leaves the drawing or does not run from a gateway box's edge to the audit
  log's top, the audit log has fewer marks than requests or its marks leave it or touch its label, or a phone frame
  is wider than `PHONE_MAX_W`; `draw()` also throws when the requests table lacks exactly one refused and one cached
  request, or a request's keyPoints and keyTimes differ in count; `flash()` throws for a check no request crosses, and
  `times()` on keyTimes outside the 12 s loop or out of order (each makes the browser drop the animation). The gate
  and party counts are enforced by `Frame`'s `Row<…>` (callers, targets) and `Gateway<…>` (AI and MCP gates) fields,
  which use the private `Per<T, V>` mapped type, so a frame with the wrong number fails `astro check`. If `times()`
  throws, move geometry, never the requests or `SPEED`. `FIGURES` is computed at import, so a broken frame fails
  `pnpm test` in CI before an image exists. `tests/gateway-path.test.ts` pins those throws; `home.test.ts` pins each
  frame's pulse counts, labels and check order, that every `keyTimes` list runs 0 to 1 in order and matches its
  `values` or `keyPoints` in length, and that nothing under `motion-reduce:hidden` is text or a node rect.
- `web/tests/__snapshots__/gateway-path-wide.svg` and `gateway-path-stacked.svg` pin the home gateway figure's two
  SVGs, SMIL timings included (`home.test.ts`, `toMatchFileSnapshot`). Astro's dev `data-astro-source-file`/`-loc`
  attributes (an absolute path and a line number) are stripped before comparing. Never run `vitest -u` to make a
  layout change pass: a diff means that drawing changed, so fix the change, and update a file only for an intended
  change to its figure.
