import { AI_GATES, CALLERS, MCP_GATES, MODEL_TARGETS, TOOL_TARGET } from "../data/gateway";
import { overlaps, path, width, type Point, type Rect, type Segment } from "./gateway-map";

/**
 * GatewayPath's geometry and timing (pure, so a frame's invariants are testable against bad fixtures). The engine
 * works in flow coordinates, [along, across], where along is the direction a request travels: the wide figure is
 * that engine with along = x, the stacked one (phones) the same engine with along = y. Only xy(), run() and rect()
 * know the axis, so both frames share every rule and the one requests table.
 * draw() throws, naming the offender, when a name would not fit its box, a label or box would leave the drawing, a
 * label would touch another label, a box it is not in, a lane or a check's dot, two boxes would overlap, a check
 * would sit off its line, a gateway line would leave its box or pass through another, an audit drop would bend
 * diagonally, leave the drawing or not run from a gateway box's edge to the audit log's top, the audit log would have
 * fewer marks than requests or its marks would leave it or touch its label, a phone frame would be wider than its
 * drawing area, the requests table would not hold exactly one refused and one cached request, no request would light
 * a check, or an animation's keyTimes would fall outside the loop or not match its keyPoints (the browser drops such
 * an animation silently). check() holds the static rules; the timing ones live beside the animations they guard.
 */

const LOOP = 12; // seconds; every animation shares this clock
const SPEED = 100; // drawing units per second
/** The drawing area on a 320px phone: 320 minus the page's px-4, the card's p-5 and its border. A phone frame may be no wider. */
const PHONE_MAX_W = 246;
const CACHE_HOLD = 0.4; // seconds a cache hit rests on the gate before the answer heads back
const INSET = 6; // text to box edge, each side
const CLEAR = 2; // least space between a label and anything it must not touch
const LINE = 15; // baseline pitch of a two-line name
const PITCH = 7; // between audit marks
/**
 * Label sizes, each with the Tailwind classes GatewayLabel renders it with. bold15: the wide AI title. bold13: the
 * other gateway titles, and on phones the AI title too (at 15px it would reach the lanes entering its box). text12:
 * names. text11: names on phones, and every check label.
 */
export const FONT = {
  bold15: { px: 15, weight: 700, class: "fill-foreground text-[15px] font-bold" },
  bold13: { px: 13, weight: 700, class: "fill-foreground text-[13px] font-bold" },
  text12: { px: 12, weight: 400, class: "fill-foreground text-[12px]" },
  text11: { px: 11, weight: 400, class: "fill-foreground text-[11px]" },
} as const;
type Tone = keyof typeof FONT;
/** One value per entry of a data tuple: a frame with the wrong number of gates, callers or targets fails to compile. */
type Per<T extends readonly unknown[], V> = { readonly [K in keyof T]: V };

const TARGETS = [...MODEL_TARGETS, TOOL_TARGET] as const;
const TOOLS = 2; // index of the MCP target
// caller index; target index, or how the AI Gateway ends it early; start second.
const requests: { from: number; to: number | "refused" | "cached"; start: number }[] = [
  { from: 0, to: 0, start: 0.3 },
  { from: 2, to: TOOLS, start: 0.7 },
  { from: 2, to: 1, start: 1.6 },
  { from: 1, to: "cached", start: 2.9 },
  { from: 3, to: 0, start: 4.2 },
  { from: 0, to: TOOLS, start: 4.6 },
  { from: 3, to: "refused", start: 5.5 },
  { from: 0, to: 1, start: 6.8 },
  { from: 3, to: TOOLS, start: 7.4 },
  { from: 2, to: 0, start: 8.1 },
];

/** [along, across]: engine-only, never reaches the template. */
type Flow = readonly [along: number, across: number];
type Anchor = "start" | "middle" | "end";
/** One line renders as bare text; more lines render as tspans. No anchor omits the attribute. */
export interface Label {
  tone: Tone;
  x: number;
  anchor?: Anchor;
  lines: readonly { text: string; y: number }[];
}
/** Where a check's label sits, relative to its dot. */
interface Place {
  dx: number;
  dy: number;
  anchor: Anchor;
}
/** Boxes `size` wide across the lanes, centred on each `across`, and `depth` deep along them, ending (callers) or starting (targets) at the lane end. */
interface Row<N extends readonly unknown[] = readonly unknown[]> {
  depth: number;
  size: number;
  across: Per<N, number>;
}
type Check = readonly [along: number, label: Place];
/**
 * A gateway: the line its checks sit on, in flow coordinates (`gates`: each check's along-position and label place,
 * one per name in AI_GATES / MCP_GATES, in order), and its drawn box and title in SVG coordinates.
 */
interface Gateway<G extends readonly string[] = readonly string[]> {
  across: number;
  from: number;
  to: number;
  gates: Per<G, Check>;
  box: Rect & { rx: number };
  title: Label;
}
/** Everything one orientation decides. The numbers are hand-placed; check() rejects a frame they break. */
interface Frame {
  id: string;
  phone: boolean; // shown below the sm breakpoint and no wider than PHONE_MAX_W; else shown from sm up
  view: { w: number; h: number };
  axis: "H" | "V"; // H: along = x (wide). V: along = y (stacked).
  start: number; // along-position where lanes leave the callers
  end: number; // along-position where lanes reach the targets
  names: Tone; // the callers' and targets' names
  callers: Row<typeof CALLERS>;
  targets: Row<typeof TARGETS>;
  ai: Gateway<typeof AI_GATES>;
  mcp: Gateway<typeof MCP_GATES>;
  /** The wires from the gateway boxes into the audit log: each runs from a box edge to the log's top in horizontals and verticals. */
  drops: readonly (readonly Point[])[];
  audit: { box: Rect; label: Label; marks: { x0: number; count: number; baseline: number } };
}

// The wide AI labels alternate above and below the line: at a 32-unit pitch neighbours would otherwise touch.
const above: Place = { dx: 0, dy: -16, anchor: "middle" };
const below: Place = { dx: 0, dy: 20, anchor: "middle" };
// Stacked: every label ends left of its line, so a long one grows away from the dots, never into them.
const beside: Place = { dx: -12, dy: 4, anchor: "end" };
export const FRAMES: Readonly<Record<"wide" | "stacked", Frame>> = {
  wide: {
    id: "path",
    phone: false,
    view: { w: 520, h: 308 },
    axis: "H",
    start: 130,
    end: 396,
    names: "text12",
    callers: { depth: 124, size: 40, across: [44, 92, 140, 188] },
    targets: { depth: 118, size: 40, across: [70, 130, 222] },
    ai: {
      across: 110,
      from: 176,
      to: 344,
      gates: [
        [196, above],
        [228, below],
        [260, above],
        [292, below],
        [324, above],
      ],
      box: { x: 170, y: 24, w: 180, h: 140, rx: 14 },
      title: { tone: "bold15", x: 260, anchor: "middle", lines: [{ text: "AI Gateway", y: 52 }] },
    },
    mcp: {
      across: 222,
      from: 170,
      to: 318,
      gates: [
        [212, below],
        [276, below],
      ],
      box: { x: 170, y: 180, w: 148, h: 70, rx: 12 },
      title: { tone: "bold13", x: 244, anchor: "middle", lines: [{ text: "MCP Gateway", y: 201 }] },
    },
    drops: [
      [
        [334, 164],
        [334, 268],
      ],
      [
        [244, 250],
        [244, 268],
      ],
    ],
    audit: { box: { x: 6, y: 268, w: 508, h: 34 }, label: { tone: "text12", x: 20, lines: [{ text: "Audit log", y: 289 }] }, marks: { x0: 236, count: 38, baseline: 293 } },
  },
  // Phones: the wide topology transposed. Callers across the top, the two gateways as columns of checks, targets
  // below, the audit log a bar at the bottom. Azure AI Foundry sits under the AI line: the 8.1 s request to it
  // has the least loop left, and a longer lane out would carry its target flash past 12 s.
  stacked: {
    id: "path-stacked",
    phone: true,
    view: { w: 240, h: 402 },
    axis: "V",
    start: 48,
    end: 312,
    names: "text11",
    callers: { depth: 40, size: 56, across: [30, 90, 150, 210] },
    targets: { depth: 40, size: 64, across: [110, 39, 200] },
    ai: {
      across: 106,
      from: 100,
      to: 268,
      gates: [
        [120, beside],
        [152, beside],
        [184, beside],
        [216, beside],
        [248, beside],
      ],
      box: { x: 6, y: 84, w: 112, h: 192, rx: 14 },
      title: { tone: "bold13", x: 12, anchor: "start", lines: [{ text: "AI Gateway", y: 104 }] },
    },
    mcp: {
      across: 200,
      from: 100,
      to: 248,
      gates: [
        [142, beside],
        [206, beside],
      ],
      box: { x: 126, y: 84, w: 108, h: 172, rx: 12 },
      title: { tone: "bold13", x: 132, anchor: "start", lines: [{ text: "MCP", y: 112 }, { text: "Gateway", y: 126 }] },
    },
    // The AI drop leaves the box sideways and falls through the gap between the Foundry and MCP server boxes: straight
    // down from the AI line it would run along the lane out to Azure AI Foundry and into that box.
    drops: [
      [
        [118, 266],
        [150, 266],
        [150, 362],
      ],
      [
        [160, 256],
        [160, 362],
      ],
    ],
    audit: { box: { x: 6, y: 362, w: 228, h: 34 }, label: { tone: "text11", x: 18, lines: [{ text: "Audit log", y: 383 }] }, marks: { x0: 76, count: 22, baseline: 387 } },
  },
};

/** SMIL attribute bags, spread onto <animate> / <animateMotion>. */
interface Anim {
  dur: string;
  repeatCount: "indefinite";
  attributeName: "opacity";
  values: string;
  keyTimes: string;
}
interface Motion {
  dur: string;
  repeatCount: "indefinite";
  calcMode: "linear";
  keyPoints: string;
  keyTimes: string;
  path: string;
}
type Kind = "passed" | "tool" | "cached" | "refused";
interface Mark {
  x: number;
  y: number;
  h: number;
}
interface Pulse {
  kind: Kind;
  /** A head and two fainter followers on the same path, each a beat behind: a comet, not a dot. */
  dots: readonly { r: number; shade: Shade; motion: Motion; show: Anim }[];
  mark: Mark & { anim: Anim };
}
/** Render-ready: every number, string and class final, so the template does no arithmetic. */
interface Figure {
  id: string;
  /** The wrapper div's classes; the two frames share the sm breakpoint, so one is shown at a time. */
  wrap: "hidden sm:block" | "sm:hidden";
  viewBox: string;
  wires: readonly string[];
  callers: readonly { rect: Rect; label: Label }[];
  targets: readonly { rect: Rect; label: Label }[];
  glow: Rect;
  gateways: readonly { box: Rect & { rx: number }; title: Label; line: string; checks: readonly { at: Point; label: Label }[] }[];
  audit: { box: Rect; label: Label; history: readonly Mark[] };
  /** Everything that moves. The template puts exactly this under `motion-reduce:hidden`; the drawing above is complete without it. */
  motion: {
    callers: readonly { rect: Rect; flash: Anim }[];
    targets: readonly { rect: Rect; flash: Anim }[];
    checks: readonly { at: Point; flash: Anim }[];
    pulses: readonly Pulse[];
    refusal: { at: Point; cross: string; show: Anim };
    hit: { at: Point; tick: string; show: Anim };
  };
}
/** A wire in SVG coordinates: the path the template draws, and the polyline check() tests labels against. */
interface Lane {
  d: string;
  points: readonly Point[];
}

// An S-curve between two points that leaves and arrives along the travel axis.
const curve = ([a0, c0]: Flow, [a1, c1]: Flow): Flow[] => [[a0, c0], [(a0 + a1) / 2, c0], [(a0 + a1) / 2, c1], [a1, c1]];
// A cubic as 33 points, 32 steps apart in t: the polyline length() measures and check() tests labels against.
const sample = ([p0, p1, p2, p3]: readonly Flow[]): Flow[] => {
  const at = (t: number, i: 0 | 1) => (1 - t) ** 3 * p0[i] + 3 * (1 - t) ** 2 * t * p1[i] + 3 * (1 - t) * t ** 2 * p2[i] + t ** 3 * p3[i];
  return Array.from({ length: 33 }, (_, s) => [at(s / 32, 0), at(s / 32, 1)]);
};
// A cubic's length: the pulses move at one speed, so gate timings need real distances.
const length = (points: readonly Flow[]) => {
  const p = sample(points);
  let total = 0;
  for (let s = 1; s <= 32; s++) total += Math.hypot(p[s][0] - p[s - 1][0], p[s][1] - p[s - 1][1]);
  return total;
};
// Whether a segment passes through a rectangle (Liang-Barsky clipping); endpoints on the edge count.
const crosses = ([[x0, y0], [x1, y1]]: Segment, r: Rect): boolean => {
  const dx = x1 - x0;
  const dy = y1 - y0;
  let t0 = 0;
  let t1 = 1;
  for (const [p, q] of [[-dx, x0 - r.x], [dx, r.x + r.w - x0], [-dy, y0 - r.y], [dy, r.y + r.h - y0]]) {
    if (p === 0) {
      if (q < 0) return false;
    } else if (p < 0) t0 = Math.max(t0, q / p);
    else t1 = Math.min(t1, q / p);
  }
  return t0 <= t1;
};

const loop = { dur: `${LOOP}s`, repeatCount: "indefinite" } as const;
/**
 * SMIL keyTimes: fractions of the loop, in order, from 0 to 1. Throws, naming `what`, on a second outside (0, LOOP)
 * or a list that goes backwards: the browser would drop that animation silently.
 */
function times(what: string, seconds: readonly number[]): string {
  seconds.forEach((s, i) => {
    if (!(s > 0 && s < LOOP) || (i > 0 && s < seconds[i - 1]))
      throw new Error(`gateway-path: ${what} needs keyTimes inside the ${LOOP}s loop and in order, not ${seconds.map((t) => t.toFixed(2)).join(", ")}`);
  });
  return [0, ...seconds.map((s) => +(s / LOOP).toFixed(4)), 1].join(";");
}
/**
 * An opacity animation that lights at each of the given seconds and fades over `hold`. Throws when nothing lights it:
 * an empty list would emit values "0;;0" against keyTimes "0;1", which the browser drops silently.
 */
const flash = (what: string, at: readonly number[], hold = 0.5): Anim => {
  if (!at.length) throw new Error(`gateway-path: no request lights ${what}`);
  return {
    ...loop,
    attributeName: "opacity",
    values: `0;${at.map(() => "0;1;0").join(";")};0`,
    keyTimes: times(what, [...at].sort((a, b) => a - b).flatMap((t) => [t - 0.05, t, t + hold])),
  };
};
// An opacity animation that shows from `from` to `to`.
const show = (what: string, from: number, to: number, fade = 0.15): Anim => ({
  ...loop,
  attributeName: "opacity",
  values: "0;0;1;1;0;0",
  keyTimes: times(what, [from, from + fade, to, to + fade]),
});
const TAIL = [
  { r: 4, lag: 0, shade: "" },
  { r: 3, lag: 0.07, shade: "opacity-50" },
  { r: 2, lag: 0.14, shade: "opacity-25" },
] as const;
type Shade = (typeof TAIL)[number]["shade"];

/** A name as one line when it fits `maxPx`, else two lines split at the space that fits both; throws when neither does. */
function wrap(text: string, maxPx: number, px: number): string[] {
  if (width(text, px) <= maxPx) return [text];
  const words = text.split(" ");
  for (let i = words.length - 1; i > 0; i--) {
    const lines = [words.slice(0, i).join(" "), words.slice(i).join(" ")];
    if (lines.every((line) => width(line, px) <= maxPx)) return lines;
  }
  throw new Error(`gateway-path: "${text}" does not fit ${maxPx}px wide on two lines`);
}
/** A node's name centred in its box, on one line or two. */
function name(r: Rect, text: string, tone: Tone): Label {
  const lines = wrap(text, r.w - 2 * INSET, FONT[tone].px);
  const first = r.y + r.h / 2 + (lines.length === 1 ? 4 : -3);
  return { tone, x: r.x + r.w / 2, anchor: "middle", lines: lines.map((line, k) => ({ text: line, y: first + LINE * k })) };
}
/** The area a label covers: cap height above the first baseline, a descender below the last. */
function bounds(l: Label): Rect {
  const { px, weight } = FONT[l.tone];
  const w = Math.max(...l.lines.map((n) => width(n.text, px, weight)));
  const x = l.anchor === "middle" ? l.x - w / 2 : l.anchor === "end" ? l.x - w : l.x;
  const y = l.lines[0].y - px;
  return { x, y, w, h: l.lines[l.lines.length - 1].y + 3 - y };
}

interface Raw {
  kind: Kind;
  from: number;
  to: number | "refused" | "cached";
  start: number;
  end: number;
  d: string;
  // Path fractions (keyPoints) at the seconds in `stops`.
  keyPoints: string;
  stops: number[];
  // When this request crosses each check it passes.
  crossings: { gateway: Gateway; i: number; at: number }[];
}

/**
 * The static drawing must hold what it draws: every label sits inside its box (INSET from the sides, as in
 * gateway-map), every check sits on its line, every line inside its box and through no other, no two boxes overlap,
 * every drop runs in horizontals and verticals from a gateway box's edge to the audit log's top, the audit marks sit
 * inside the log clear of its label, every box, label, mark and drop point stays inside the viewBox, no label comes
 * within CLEAR of another label, a box it is not in, a lane or a check's dot, and a phone frame is no wider than
 * PHONE_MAX_W. Timing problems surface from flash() and times() as draw() builds the animations.
 */
function check(f: Frame, fig: Omit<Figure, "motion">, lanes: readonly Lane[], lines: readonly Lane[]): void {
  const problems: string[] = [];
  const { w: W, h: H } = f.view;
  if (f.phone && W > PHONE_MAX_W) problems.push(`a ${W}-unit frame is wider than ${PHONE_MAX_W}, the drawing area on a 320px phone`);
  const within = (r: Rect, box: Rect, pad: number) => r.x >= box.x + pad && r.y >= box.y && r.x + r.w <= box.x + box.w - pad && r.y + r.h <= box.y + box.h;
  const on = ([x, y]: Point, box: Rect) => within({ x, y, w: 0, h: 0 }, box, 0);
  const onEdge = (p: Point, box: Rect) => on(p, box) && (p[0] === box.x || p[0] === box.x + box.w || p[1] === box.y || p[1] === box.y + box.h);
  const view = { x: 0, y: 0, w: W, h: H };
  const said = (l: Label) => `"${l.lines.map((n) => n.text).join(" ")}"`;
  const inside = (r: Rect, what: string) => {
    if (!within(r, view, 0)) problems.push(`${what} leaves the ${W}x${H} drawing`);
  };
  const fits = (l: Label, box: Rect) => {
    inside(bounds(l), said(l));
    if (!within(bounds(l), box, INSET)) problems.push(`${said(l)} does not sit inside its ${box.w}x${box.h} box`);
  };
  const boxes: { rect: Rect; label: Label }[] = [...fig.callers, ...fig.targets, { rect: fig.audit.box, label: fig.audit.label }];
  for (const { rect, label } of [...fig.callers, ...fig.targets]) {
    inside(rect, `the ${said(label)} box`);
    fits(label, rect);
  }
  const labels: Label[] = [...boxes.map((b) => b.label)];
  const checks: Figure["gateways"][number]["checks"][number][] = [];
  const through = ({ points }: Lane, r: Rect) => points.some((p, k) => k > 0 && crosses([points[k - 1], p], r));
  for (const [g, drawn, line] of [f.ai, f.mcp].map((g, i) => [g, fig.gateways[i], lines[i]] as const)) {
    inside(g.box, `the ${said(g.title)} box`);
    fits(g.title, g.box);
    if (!line.points.every((p) => on(p, g.box))) problems.push(`${said(g.title)}'s line leaves its box`);
    if (g.gates.some(([a]) => a < g.from || a > g.to)) problems.push(`${said(g.title)} has a check off its line`);
    for (const c of drawn.checks) fits(c.label, g.box);
    boxes.push({ rect: g.box, label: g.title });
    labels.push(g.title, ...drawn.checks.map((c) => c.label));
    checks.push(...drawn.checks);
  }
  boxes.forEach((a, i) => {
    for (const b of boxes.slice(i + 1)) if (overlaps(a.rect, b.rect)) problems.push(`the ${said(a.label)} box overlaps the ${said(b.label)} box`);
  });
  for (const [g, line] of [f.ai, f.mcp].map((g, i) => [g, lines[i]] as const))
    for (const b of boxes) if (b.rect !== g.box && through(line, b.rect)) problems.push(`${said(g.title)}'s line passes through the ${said(b.label)} box`);
  f.drops.forEach((d, i) => {
    const first = d[0];
    const last = d[d.length - 1];
    const { x, y, w } = f.audit.box;
    if (![f.ai.box, f.mcp.box].some((box) => onEdge(first, box))) problems.push(`drop ${i + 1} starts at [${first.join(", ")}], not on a gateway box's edge`);
    if (last[1] !== y) problems.push(`drop ${i + 1} ends at y ${last[1]}, not on the audit log's top edge (${y})`);
    if (last[0] < x || last[0] > x + w) problems.push(`drop ${i + 1} ends at x ${last[0]}, beside the audit log (x ${x} to ${x + w})`);
    d.forEach((p, k) => {
      if (!on(p, view)) problems.push(`drop ${i + 1} has a point at [${p.join(", ")}] outside the ${W}x${H} drawing`);
      // path() draws a diagonal as a plain H, silently dropping the change in y.
      if (k > 0 && p[0] !== d[k - 1][0] && p[1] !== d[k - 1][1]) problems.push(`drop ${i + 1} runs diagonally from [${d[k - 1].join(", ")}] to [${p.join(", ")}]`);
    });
  });
  inside(fig.audit.box, "the audit log");
  fits(fig.audit.label, fig.audit.box);
  if (f.audit.marks.count < requests.length) problems.push(`the audit log has ${f.audit.marks.count} marks for ${requests.length} requests`);
  const last = fig.audit.history.length + requests.length - 1;
  const strip = { x: f.audit.marks.x0, y: f.audit.marks.baseline - 9, w: last * PITCH + 3, h: 9 };
  if (!within(strip, fig.audit.box, INSET)) problems.push("the audit marks leave the audit log");
  if (overlaps(strip, bounds(fig.audit.label))) problems.push(`the audit marks touch ${said(fig.audit.label)}`);

  const room = (r: Rect): Rect => ({ x: r.x - CLEAR, y: r.y - CLEAR, w: r.w + 2 * CLEAR, h: r.h + 2 * CLEAR });
  labels.forEach((l, i) => {
    const r = bounds(l);
    for (const other of labels.slice(i + 1)) if (overlaps(room(r), bounds(other))) problems.push(`${said(l)} touches ${said(other)}`);
    for (const b of boxes) if (!within(r, b.rect, 0) && overlaps(room(r), b.rect)) problems.push(`${said(l)} touches the ${said(b.label)} box`);
    if (lanes.some((lane) => through(lane, room(r)))) problems.push(`${said(l)} touches a lane`);
  });
  // A check's dot is the drawn r=6 ring; its square is an obstacle to every check label under the same CLEAR rule.
  for (const c of checks)
    for (const { at: [dx, dy], label } of checks)
      if (overlaps(room(bounds(c.label)), { x: dx - 6, y: dy - 6, w: 12, h: 12 })) problems.push(`${said(c.label)} touches the ${said(label)} dot`);
  if (problems.length) throw new Error(`gateway-path: ${problems.join("; ")}`);
}

/** One frame in, one render-ready figure out; throws on any fit or timing problem. */
export function draw(f: Frame): Figure {
  const xy = ([along, across]: Flow): Point => (f.axis === "H" ? [along, across] : [across, along]);
  const run = (along: number) => `${f.axis}${along}`;
  const rect = (a0: number, a1: number, c0: number, c1: number): Rect =>
    f.axis === "H" ? { x: a0, y: c0, w: a1 - a0, h: c1 - c0 } : { x: c0, y: a0, w: c1 - c0, h: a1 - a0 };
  const curveTo = ([, a, b, c]: readonly Flow[]) => `C${xy(a).join(" ")} ${xy(b).join(" ")} ${xy(c).join(" ")}`;
  const lane = (points: readonly Flow[]) => `M${xy(points[0]).join(" ")} ${curveTo(points)}`;
  const curved = (points: readonly Flow[]): Lane => ({ d: lane(points), points: sample(points).map(xy) });
  const straight = (a0: number, a1: number, c: number): Lane => {
    const seg: Segment = [xy([a0, c]), xy([a1, c])];
    return { d: path(seg), points: seg };
  };
  const laneIn = (c: number, g: Gateway) => curve([f.start, c], [g.from, g.across]);
  const laneOut = (c: number) => curve([f.ai.to, f.ai.across], [f.end, c]);
  const GUARDRAILS = f.ai.gates[AI_GATES.indexOf("Guardrails")][0];
  const CACHE = f.ai.gates[AI_GATES.indexOf("Cache")][0];

  const pulses = requests.map(({ from, to, start }): Raw => {
    const c = f.callers.across[from];
    const gateway = to === TOOLS ? f.mcp : f.ai;
    const lead = length(laneIn(c, gateway));
    const reach = (a: number) => start + (lead + a - gateway.from) / SPEED;
    // Where the run along the gateway's line ends: at the check that stops it, or the far side.
    const stop = to === "refused" ? GUARDRAILS : to === "cached" ? CACHE : gateway.to;
    const pulse: Raw = {
      kind: to === TOOLS ? "tool" : typeof to === "number" ? "passed" : to,
      from,
      to,
      start,
      end: reach(stop),
      d: `${lane(laneIn(c, gateway))} ${run(stop)}`,
      keyPoints: "0;0;1;1",
      stops: [start, reach(stop)],
      crossings: gateway.gates.flatMap(([a], i) => (a < stop ? [{ gateway, i, at: reach(a) }] : [])),
    };
    if (to === TOOLS) {
      pulse.d += ` ${run(f.end)}`;
      pulse.end = reach(f.end);
      pulse.stops = [start, pulse.end];
    } else if (typeof to === "number") {
      const out = laneOut(f.targets.across[to]);
      pulse.d += ` ${curveTo(out)}`;
      pulse.end += length(out) / SPEED;
      pulse.stops = [start, pulse.end];
    } else if (to === "cached") {
      // A cache hit never reaches a model: the answer goes back the way the request came. The return is the lead
      // reversed, so it is as long as the way in and the 0.5 keyPoint below splits the path in half.
      const back = curve([f.ai.from, f.ai.across], [f.start, c]);
      const arrive = pulse.end;
      pulse.d += ` ${run(f.ai.from)} ${curveTo(back)}`;
      pulse.end = arrive + CACHE_HOLD + (arrive - start);
      pulse.keyPoints = "0;0;0.5;0.5;1;1";
      pulse.stops = [start, arrive, arrive + CACHE_HOLD, pulse.end];
    }
    return pulse;
  });
  const only = (kind: Kind): Raw => {
    const found = pulses.filter((p) => p.kind === kind);
    if (found.length !== 1) throw new Error(`gateway-path: the requests table has ${found.length} ${kind} requests, not one`);
    return found[0];
  };
  const refusal = only("refused");
  const hit = only("cached");
  const crossed = (g: Gateway, i: number) => pulses.flatMap((p) => p.crossings.filter((c) => c.gateway === g && c.i === i).map((c) => c.at));

  // The audit log's marks: older ones are fixed; the last one per request is this loop's, in the order they finish.
  const { x0, count, baseline } = f.audit.marks;
  const marks = Array.from({ length: count }, (_, i): Mark => {
    const h = 3 + ((i * PITCH) % 5) * 1.5;
    return { x: x0 + i * PITCH, y: baseline - h, h };
  });
  const history = marks.slice(0, -pulses.length);
  const recent = marks.slice(-pulses.length);
  const finished = [...pulses].sort((a, b) => a.end - b.end);

  const party = (row: Row, a0: number, a1: number, names: readonly string[]) =>
    row.across.map((c, i) => {
      const r = rect(a0, a1, c - row.size / 2, c + row.size / 2);
      return { rect: r, label: name(r, names[i], f.names) };
    });
  const inLanes = f.callers.across.map((c) => [curved(laneIn(c, f.ai)), curved(laneIn(c, f.mcp))]);
  const outLanes = f.targets.across.map((c, i) => (i === TOOLS ? straight(f.mcp.to, f.end, f.mcp.across) : curved(laneOut(c))));
  const lines = [f.ai, f.mcp].map((g) => straight(g.from, g.to, g.across));
  const drops = f.drops.map((points): Lane => ({ d: points.slice(1).map((p, i) => path([points[i], p])).join(" "), points }));
  const callers = party(f.callers, f.start - f.callers.depth, f.start, CALLERS);
  const targets = party(f.targets, f.end, f.end + f.targets.depth, TARGETS);
  const gateways = [
    [f.ai, AI_GATES],
    [f.mcp, MCP_GATES],
  ] as const;
  const { x, y, w, h } = f.ai.box;
  const figure: Omit<Figure, "motion"> = {
    id: f.id,
    // Both literal, so Tailwind's scan finds them.
    wrap: f.phone ? "sm:hidden" : "hidden sm:block",
    viewBox: `0 0 ${f.view.w} ${f.view.h}`,
    wires: [...inLanes.map((pair) => pair.map((l) => l.d).join(" ")), ...outLanes.map((l) => l.d), drops.map((l) => l.d).join(" ")],
    callers,
    targets,
    // Inset from the AI box; the filter's blur spreads it back out towards the edges.
    glow: { x: x + 12, y: y + 16, w: w - 24, h: h - 32 },
    gateways: gateways.map(([g, labels], i) => ({
      box: g.box,
      title: g.title,
      line: lines[i].d,
      checks: g.gates.map(([a, { dx, dy, anchor }], k) => {
        const at = xy([a, g.across]);
        return { at, label: { tone: "text11", x: at[0] + dx, anchor, lines: [{ text: labels[k], y: at[1] + dy }] } };
      }),
    })),
    audit: { box: f.audit.box, label: f.audit.label, history },
  };
  check(f, figure, [...inLanes.flat(), ...outLanes, ...lines, ...drops], lines);

  const [gx, gy] = xy([GUARDRAILS, f.ai.across]);
  const [cx, cy] = xy([CACHE, f.ai.across]);
  return {
    ...figure,
    motion: {
      callers: callers.map(({ rect }, i) => ({ rect, flash: flash(CALLERS[i], pulses.filter((p) => p.from === i).map((p) => p.start), 0.7) })),
      targets: targets.map(({ rect }, i) => ({ rect, flash: flash(TARGETS[i], pulses.filter((p) => p.to === i).map((p) => p.end), 0.7) })),
      checks: gateways.flatMap(([g, labels]) => g.gates.map(([a], i) => ({ at: xy([a, g.across]), flash: flash(labels[i], crossed(g, i)) }))),
      pulses: pulses.map((p, n) => {
        const what = `request ${n + 1}`;
        const refused = p.kind === "refused";
        // times() emits one keyTime per stop plus 0 and 1; an animateMotion whose keyPoints differ in count is dropped silently.
        const points = p.keyPoints.split(";").length;
        if (points !== p.stops.length + 2) throw new Error(`gateway-path: ${what} has ${points} keyPoints for ${p.stops.length + 2} keyTimes`);
        return {
          kind: p.kind,
          dots: TAIL.map(({ r, lag, shade }) => ({
            r,
            shade,
            motion: { ...loop, calcMode: "linear", keyPoints: p.keyPoints, keyTimes: times(what, p.stops.map((s) => s + lag)), path: p.d },
            show: show(what, p.start + lag, p.end + lag + (refused ? 0.1 : -0.15), refused ? 0.3 : 0.15),
          })),
          mark: {
            ...recent[finished.indexOf(p)],
            anim: { ...loop, attributeName: "opacity", values: "0;0;1;1;0", keyTimes: times(`${what}'s audit mark`, [p.end, p.end + 0.1, LOOP - 0.1]) },
          },
        };
      }),
      refusal: { at: [gx, gy], cross: `M${gx - 3} ${gy - 3} l6 6 m0 -6 l-6 6`, show: show("the refusal cross", refusal.end, refusal.end + 0.8) },
      hit: { at: [cx, cy], tick: `M${cx - 3.5} ${cy} l2.5 2.5 l4.5 -5`, show: show("the cache tick", hit.stops[1], hit.stops[2] + 0.5) },
    },
  };
}

/**
 * The two drawings GatewayPath renders: wide, then stacked. Computed at import, so a broken frame fails `pnpm test`
 * (home.test.ts and gateway-path.test.ts) and the e2e run in CI before an image exists; at run time it would 500 only
 * the two pages that import the component.
 */
export const FIGURES = [draw(FRAMES.wide), draw(FRAMES.stacked)];
