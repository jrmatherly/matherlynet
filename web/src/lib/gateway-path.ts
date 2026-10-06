import { AI_GATES, CALLERS, MCP_GATES, MODEL_TARGETS, TOOL_TARGET } from "../data/gateway";
import { width } from "./gateway-map";

/**
 * GatewayPath's geometry and timing (pure, so a frame's invariants are testable against bad fixtures). The engine
 * works in flow coordinates, [along, across], where along is the direction a request travels: the wide figure is
 * that engine with along = x. Only xy(), run() and rect() know the axis, so a transposed frame reuses every rule.
 * draw() throws, naming the offender, when a name would not fit its box, a label or box would leave the drawing, or
 * an animation's keyTimes would fall outside the loop (the browser drops such an animation silently).
 */

export const LOOP = 12; // seconds; every animation shares this clock
export const SPEED = 100; // drawing units per second
const CACHE_HOLD = 0.4; // seconds a cache hit rests on the gate before the answer heads back
const INSET = 6; // text to box edge, each side
const LINE = 15; // baseline pitch of a two-line name
const PITCH = 7; // between audit marks
/** ai and mcp: the gateway titles; name: a node's name; check: a gate's label. */
const FONT = { ai: { px: 15, weight: 700 }, mcp: { px: 13, weight: 700 }, name: { px: 12, weight: 400 }, check: { px: 11, weight: 400 } } as const;
export type Tone = keyof typeof FONT;

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
type Point = readonly [x: number, y: number];
type Anchor = "start" | "middle" | "end";
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
/** One line renders as bare text; more lines render as tspans. No anchor omits the attribute. */
export interface Label {
  tone: Tone;
  x: number;
  anchor?: Anchor;
  lines: readonly { text: string; y: number }[];
}
/** Boxes `size` wide across the lanes, centred on each `across`, and `depth` deep along them, ending (callers) or starting (targets) at the lane end. */
interface Row {
  depth: number;
  size: number;
  across: readonly number[];
}
/**
 * A gateway: the line its checks sit on, in flow coordinates (`gates` are along-positions in AI_GATES / MCP_GATES
 * order), and its drawn box and title in SVG coordinates. `labelAt` places each check's label beside its dot.
 */
interface Gateway {
  across: number;
  from: number;
  to: number;
  gates: readonly number[];
  box: Rect & { rx: number };
  title: Label;
  labelAt: readonly { dx: number; dy: number; anchor: Anchor }[];
}
/** Everything one orientation decides. Hand-placed: the wide numbers are today's constants, and check() keeps a frame honest. */
export interface Frame {
  id: string;
  svgClass: string;
  view: { w: number; h: number };
  axis: "H" | "V"; // H: along = x (wide). V: along = y (stacked).
  start: number; // along-position where lanes leave the callers
  end: number; // along-position where lanes reach the targets
  callers: Row;
  targets: Row;
  ai: Gateway;
  mcp: Gateway;
  glow: Rect;
  drops: string; // the wires from the gateway boxes into the audit log
  audit: { box: Rect; label: Label; marks: { x0: number; count: number; baseline: number } };
}

// The AI labels alternate above and below the line: at a 32-unit pitch neighbours would otherwise touch.
const above = { dx: 0, dy: -16, anchor: "middle" } as const;
const below = { dx: 0, dy: 20, anchor: "middle" } as const;
export const FRAMES: Record<"wide", Frame> = {
  wide: {
    id: "path",
    svgClass: "block h-auto w-full min-w-[520px] font-sans sm:min-w-0",
    view: { w: 520, h: 308 },
    axis: "H",
    start: 130,
    end: 396,
    callers: { depth: 124, size: 40, across: [44, 92, 140, 188] },
    targets: { depth: 118, size: 40, across: [70, 130, 222] },
    ai: {
      across: 110,
      from: 176,
      to: 344,
      gates: [196, 228, 260, 292, 324],
      box: { x: 170, y: 24, w: 180, h: 140, rx: 14 },
      title: { tone: "ai", x: 260, anchor: "middle", lines: [{ text: "AI Gateway", y: 52 }] },
      labelAt: [above, below, above, below, above],
    },
    // The registry check: only servers approved into the registry are reachable.
    mcp: {
      across: 222,
      from: 170,
      to: 318,
      gates: [212, 276],
      box: { x: 170, y: 180, w: 148, h: 70, rx: 12 },
      title: { tone: "mcp", x: 244, anchor: "middle", lines: [{ text: "MCP Gateway", y: 201 }] },
      labelAt: [below, below],
    },
    glow: { x: 182, y: 40, w: 156, h: 108 },
    drops: "M334 164 V268 M244 250 V268",
    audit: { box: { x: 6, y: 268, w: 508, h: 34 }, label: { tone: "name", x: 20, lines: [{ text: "Audit log", y: 289 }] }, marks: { x0: 236, count: 38, baseline: 293 } },
  },
};

/** SMIL attribute bags, spread onto <animate> / <animateMotion>. */
export interface Anim {
  dur: string;
  repeatCount: "indefinite";
  attributeName: "opacity";
  values: string;
  keyTimes: string;
}
export interface Motion {
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
export interface Pulse {
  kind: Kind;
  /** A head and two fainter followers on the same path, each a beat behind: a comet, not a dot. */
  dots: readonly { r: number; shade: string; motion: Motion; show: Anim }[];
  mark: Mark & { refused: boolean; anim: Anim };
}
/** Render-ready: every number, string and class final, so the template does no arithmetic. */
export interface Figure {
  id: string;
  viewBox: string;
  svgClass: string;
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

// An S-curve between two points that leaves and arrives along the travel axis.
const curve = ([a0, c0]: Flow, [a1, c1]: Flow): Flow[] => [[a0, c0], [(a0 + a1) / 2, c0], [(a0 + a1) / 2, c1], [a1, c1]];
// A cubic's length, by sampling: the pulses move at one speed, so gate timings need real distances.
const length = ([p0, p1, p2, p3]: readonly Flow[]) => {
  const at = (t: number, i: 0 | 1) => (1 - t) ** 3 * p0[i] + 3 * (1 - t) ** 2 * t * p1[i] + 3 * (1 - t) * t ** 2 * p2[i] + t ** 3 * p3[i];
  let total = 0;
  for (let s = 1; s <= 32; s++) total += Math.hypot(at(s / 32, 0) - at((s - 1) / 32, 0), at(s / 32, 1) - at((s - 1) / 32, 1));
  return total;
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
// An opacity animation that lights at each of the given seconds and fades over `hold`.
const flash = (what: string, at: readonly number[], hold = 0.5): Anim => ({
  ...loop,
  attributeName: "opacity",
  values: `0;${at.map(() => "0;1;0").join(";")};0`,
  keyTimes: times(what, [...at].sort((a, b) => a - b).flatMap((t) => [t - 0.05, t, t + hold])),
});
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
];

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
/** A node's name centred in its box: one line at cy + 4, two at cy - 3 and cy + 12. */
function name(r: Rect, text: string): Label {
  const lines = wrap(text, r.w - 2 * INSET, FONT.name.px);
  const first = r.y + r.h / 2 + (lines.length === 1 ? 4 : -3);
  return { tone: "name", x: r.x + r.w / 2, anchor: "middle", lines: lines.map((line, k) => ({ text: line, y: first + LINE * k })) };
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
 * gateway-map), every check sits on its line, and every box, label and mark stays inside the viewBox. Timing
 * problems surface from times() as draw() builds the animations.
 */
function check(f: Frame, fig: Omit<Figure, "motion">): void {
  const problems: string[] = [];
  const { w: W, h: H } = f.view;
  const within = (r: Rect, box: Rect, pad: number) => r.x >= box.x + pad && r.y >= box.y && r.x + r.w <= box.x + box.w - pad && r.y + r.h <= box.y + box.h;
  const view = { x: 0, y: 0, w: W, h: H };
  const said = (l: Label) => `"${l.lines.map((n) => n.text).join(" ")}"`;
  const inside = (r: Rect, what: string) => {
    if (!within(r, view, 0)) problems.push(`${what} leaves the ${W}x${H} drawing`);
  };
  const fits = (l: Label, box: Rect) => {
    inside(bounds(l), said(l));
    if (!within(bounds(l), box, INSET)) problems.push(`${said(l)} does not sit inside its ${box.w}x${box.h} box`);
  };
  for (const { rect, label } of [...fig.callers, ...fig.targets]) {
    inside(rect, `the ${said(label)} box`);
    fits(label, rect);
  }
  inside(fig.glow, "the glow");
  for (const [g, drawn] of [f.ai, f.mcp].map((g, i) => [g, fig.gateways[i]] as const)) {
    inside(g.box, `the ${said(g.title)} box`);
    fits(g.title, g.box);
    if (g.labelAt.length !== g.gates.length) problems.push(`${said(g.title)} places ${g.labelAt.length} check labels for ${g.gates.length} checks`);
    if (g.gates.some((a) => a < g.from || a > g.to)) problems.push(`${said(g.title)} has a check off its line`);
    for (const c of drawn.checks) fits(c.label, g.box);
  }
  inside(fig.audit.box, "the audit log");
  fits(fig.audit.label, fig.audit.box);
  if (f.audit.marks.count < requests.length) problems.push(`the audit log has ${f.audit.marks.count} marks for ${requests.length} requests`);
  const last = fig.audit.history.length + requests.length - 1;
  inside({ x: f.audit.marks.x0, y: f.audit.marks.baseline - 9, w: last * PITCH + 3, h: 9 }, "the audit marks");
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
  const laneIn = (c: number, g: Gateway) => curve([f.start, c], [g.from, g.across]);
  const laneOut = (c: number) => curve([f.ai.to, f.ai.across], [f.end, c]);
  const GUARDRAILS = f.ai.gates[AI_GATES.indexOf("Guardrails")];
  const CACHE = f.ai.gates[AI_GATES.indexOf("Cache")];

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
      crossings: gateway.gates.flatMap((a, i) => (a < stop ? [{ gateway, i, at: reach(a) }] : [])),
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
  const refusal = pulses.find((p) => p.kind === "refused")!;
  const hit = pulses.find((p) => p.kind === "cached")!;
  const crossed = (g: Gateway, i: number) => pulses.flatMap((p) => p.crossings.filter((c) => c.gateway === g && c.i === i).map((c) => c.at));

  // The audit log's marks: older ones are fixed, the last ten are this loop's requests, in the order they finish.
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
      return { rect: r, label: name(r, names[i]) };
    });
  const targetNames = [...MODEL_TARGETS, TOOL_TARGET];
  const callers = party(f.callers, f.start - f.callers.depth, f.start, CALLERS);
  const targets = party(f.targets, f.end, f.end + f.targets.depth, targetNames);
  const gateways = [
    [f.ai, AI_GATES],
    [f.mcp, MCP_GATES],
  ] as const;
  const figure: Omit<Figure, "motion"> = {
    id: f.id,
    viewBox: `0 0 ${f.view.w} ${f.view.h}`,
    svgClass: f.svgClass,
    wires: [
      ...f.callers.across.map((c) => `${lane(laneIn(c, f.ai))} ${lane(laneIn(c, f.mcp))}`),
      ...f.targets.across.map((c, i) => (i === TOOLS ? `M${xy([f.mcp.to, f.mcp.across]).join(" ")} ${run(f.end)}` : lane(laneOut(c)))),
      f.drops,
    ],
    callers,
    targets,
    glow: f.glow,
    gateways: gateways.map(([g, labels]) => ({
      box: g.box,
      title: g.title,
      line: `M${xy([g.from, g.across]).join(" ")} ${run(g.to)}`,
      checks: g.gates.map((a, i) => {
        const at = xy([a, g.across]);
        const { dx, dy, anchor } = g.labelAt[i] ?? above;
        return { at, label: { tone: "check", x: at[0] + dx, anchor, lines: [{ text: labels[i], y: at[1] + dy }] } };
      }),
    })),
    audit: { box: f.audit.box, label: f.audit.label, history },
  };
  check(f, figure);

  const [gx, gy] = xy([GUARDRAILS, f.ai.across]);
  const [cx, cy] = xy([CACHE, f.ai.across]);
  return {
    ...figure,
    motion: {
      callers: callers.map(({ rect }, i) => ({ rect, flash: flash(CALLERS[i], pulses.filter((p) => p.from === i).map((p) => p.start), 0.7) })),
      targets: targets.map(({ rect }, i) => ({ rect, flash: flash(targetNames[i], pulses.filter((p) => p.to === i).map((p) => p.end), 0.7) })),
      checks: gateways.flatMap(([g, labels]) => g.gates.map((a, i) => ({ at: xy([a, g.across]), flash: flash(labels[i], crossed(g, i)) }))),
      pulses: pulses.map((p, n) => {
        const what = `request ${n + 1}`;
        const refused = p.kind === "refused";
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
            refused,
            anim: { ...loop, attributeName: "opacity", values: "0;0;1;1;0", keyTimes: times(`${what}'s audit mark`, [p.end, p.end + 0.1, LOOP - 0.1]) },
          },
        };
      }),
      refusal: { at: [gx, gy], cross: `M${gx - 3} ${gy - 3} l6 6 m0 -6 l-6 6`, show: show("the refusal cross", refusal.end, refusal.end + 0.8) },
      hit: { at: [cx, cy], tick: `M${cx - 3.5} ${cy} l2.5 2.5 l4.5 -5`, show: show("the cache tick", hit.stops[1], hit.stops[2] + 0.5) },
    },
  };
}
