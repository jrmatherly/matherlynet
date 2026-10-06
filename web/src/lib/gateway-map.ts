import type { Generation, Lines, Node, Party } from "../data/gateway-generations";

/**
 * GatewayMap's geometry (pure, so its invariants are testable against bad fixtures). Callers on the left, the hub
 * with its two services above and below, upstreams on the right. The hub spans the taller side column, so every
 * caller and upstream meets it on its own centre line and every lane is a straight horizontal or vertical.
 * layout() throws, naming the label, when text would not fit its box or would cross a lane, a node, another label or
 * a region edge, and when a region would enclose a non-member or a lane would leave and re-enter a region.
 */

/** Drawing width. GatewayMap's `min-w-[600px]` must match (gateway-map.test.ts). */
export const W = 600;
const M = 6;
// Tuned to the two generations drawn today: west is 122 so "OpenAI-compatible" (108.4px) keeps INSET a side, and any
// wider would push a caller's "virtual key" into the hub's region edge. layout() throws when a label stops fitting.
const COL = { west: { x: 6, w: 122 }, hub: { x: 200, w: 164 }, east: { x: 464, w: 124 } } as const;
const GAP = 14; // between stacked nodes
const REGION_GAP = 20; // extra, where a stack crosses a boundary: room for the region label row
const SERVICE_GAP = 34; // hub to a service: the stem and its label
const HUB_PAD = 10; // the hub overshoots the taller side column by this much, top and bottom
const PAD = { top: 24, side: 10, bottom: 10 }; // region around its members; top holds the label
const LINE = { label: 15, small: 13 };
const PX = { label: 12, hub: 13, small: 11 };
const INSET = 6; // text to box edge, each side
const LABEL_OFFSET = 6; // a wire or region label's distance from the lane, stem or edge it sits beside
const CLEAR = 2; // least space between a label and anything it must not touch

/**
 * Geist advance widths (em) for U+0020 to U+007E, read with fontTools from @fontsource-variable/geist 5.3.0
 * (geist-latin-wght-normal.woff2) at wght 400 and 700.
 */
const ADVANCE: Record<400 | 700, readonly number[]> = {
  400: [
    0.25, 0.213, 0.346, 0.478, 0.629, 0.802, 0.62, 0.178, 0.274, 0.274, 0.43, 0.558, 0.201, 0.419, 0.201, 0.48, 0.663,
    0.384, 0.619, 0.613, 0.615, 0.626, 0.593, 0.524, 0.604, 0.593, 0.297, 0.297, 0.544, 0.54, 0.544, 0.559, 0.906,
    0.668, 0.68, 0.703, 0.694, 0.603, 0.59, 0.7, 0.713, 0.27, 0.597, 0.64, 0.58, 0.877, 0.743, 0.739, 0.65, 0.733,
    0.672, 0.64, 0.552, 0.689, 0.667, 0.945, 0.606, 0.576, 0.544, 0.347, 0.455, 0.347, 0.426, 0.557, 0.248, 0.551,
    0.595, 0.546, 0.595, 0.561, 0.395, 0.594, 0.581, 0.244, 0.26, 0.59, 0.267, 0.877, 0.581, 0.573, 0.595, 0.595,
    0.379, 0.52, 0.392, 0.575, 0.536, 0.819, 0.585, 0.537, 0.537, 0.389, 0.264, 0.389, 0.523,
  ],
  700: [
    0.228, 0.257, 0.39, 0.589, 0.67, 0.825, 0.706, 0.203, 0.323, 0.323, 0.422, 0.57, 0.236, 0.417, 0.236, 0.522, 0.693,
    0.449, 0.653, 0.65, 0.656, 0.671, 0.627, 0.544, 0.664, 0.631, 0.311, 0.311, 0.55, 0.552, 0.55, 0.591, 0.962, 0.73,
    0.703, 0.734, 0.716, 0.622, 0.604, 0.738, 0.721, 0.3, 0.627, 0.689, 0.589, 0.915, 0.75, 0.776, 0.672, 0.769, 0.697,
    0.681, 0.599, 0.703, 0.73, 1.015, 0.688, 0.631, 0.594, 0.39, 0.501, 0.39, 0.461, 0.561, 0.278, 0.594, 0.634, 0.598,
    0.634, 0.605, 0.447, 0.634, 0.611, 0.281, 0.331, 0.647, 0.313, 0.9, 0.611, 0.618, 0.634, 0.634, 0.425, 0.57, 0.445,
    0.607, 0.609, 0.849, 0.65, 0.586, 0.583, 0.408, 0.294, 0.408, 0.523,
  ],
};

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
/** hub: the gateway's 13px bold name; name: a node's 12px name; small: 11px muted (notes, wire and region labels). */
export type Tone = "hub" | "name" | "small";
export interface Text {
  tone: Tone;
  x: number;
  anchor: "start" | "middle" | "end";
  lines: readonly { text: string; y: number }[];
}
export interface Drawing {
  height: number;
  regions: readonly { d: string }[];
  /** `to` is the label of the node the wire reaches. */
  wires: readonly { d: string; to: string; failover: boolean }[];
  nodes: readonly (Rect & { hub: boolean })[];
  texts: readonly Text[];
}

type Col = keyof typeof COL;
interface Placed<N extends Node<string> = Node<string>> extends Rect {
  node: N;
  col: Col;
}
export type Point = readonly [number, number];
export type Segment = readonly [Point, Point];

const lines = (v: Lines | undefined): readonly string[] => (v === undefined ? [] : typeof v === "string" ? [v] : v);
export const name = (n: Node<string>) => lines(n.label).join(" ");
const height = (n: Node<string>) => Math.max(40, 16 + LINE.label * lines(n.label).length + LINE.small * lines(n.note).length);
const cy = (r: Rect) => r.y + r.h / 2;

export function width(text: string, px: number, weight: 400 | 700 = 400): number {
  let em = 0;
  for (const ch of text) {
    const w = ADVANCE[weight][ch.charCodeAt(0) - 32];
    if (w === undefined) throw new Error(`no Geist width for "${ch}" in "${text}"`);
    em += w;
  }
  return em * px;
}

export const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
// Inclusive, so two zero-width rects (a lane and a region edge) register when they cross.
const touches = (a: Rect, b: Rect) => a.x <= b.x + b.w && a.x + a.w >= b.x && a.y <= b.y + b.h && a.y + a.h >= b.y;
/** A horizontal or vertical segment as a path. */
export const path = ([[x1, y1], [x2, y2]]: Segment) => `M${x1} ${y1} ${x1 === x2 ? `V${y2}` : `H${x2}`}`;
const segmentRect = ([[x1, y1], [x2, y2]]: Segment): Rect => ({
  x: Math.min(x1, x2),
  y: Math.min(y1, y2),
  w: Math.abs(x2 - x1),
  h: Math.abs(y2 - y1),
});
/** The area an 11px label covers, grown by CLEAR. */
function bounds(t: Text): Rect {
  const w = Math.max(...t.lines.map((l) => width(l.text, PX.small)));
  const x = t.anchor === "start" ? t.x : t.anchor === "end" ? t.x - w : t.x - w / 2;
  const y = t.lines[0].y - PX.small;
  return { x: x - CLEAR, y: y - CLEAR, w: w + 2 * CLEAR, h: t.lines.length * LINE.small + 2 * CLEAR };
}

/** A column as a stack centred on y = 0, with REGION_GAP added wherever two neighbours are in different regions. */
function stack<N extends Node<string>>(nodes: readonly N[], col: Col): { placed: Placed<N>[]; extent: number } {
  const placed: Placed<N>[] = [];
  let y = 0;
  nodes.forEach((node, i) => {
    if (i) y += GAP + (nodes[i - 1].region !== node.region ? REGION_GAP : 0);
    const h = height(node);
    placed.push({ node, col, x: COL[col].x, w: COL[col].w, y, h });
    y += h;
  });
  for (const p of placed) p.y -= y / 2;
  return { placed, extent: y };
}

/**
 * One region's outline: a padded band per column over its members, neighbouring bands joined over the rows both
 * cover, so a region across two columns is one stepped shape that lanes between its members never leave. A region
 * with no members draws nothing.
 */
function region(title: string, key: string, label: string, all: Placed[]): { points: Point[]; label: Text } | undefined {
  const bands = (["west", "hub", "east"] as const).flatMap((col, i) => {
    const members = all.filter((r) => r.col === col && r.node.region === key);
    if (!members.length) return [];
    const band = {
      i,
      x0: Math.min(...members.map((r) => r.x)) - PAD.side,
      x1: Math.max(...members.map((r) => r.x + r.w)) + PAD.side,
      y0: Math.min(...members.map((r) => r.y)) - PAD.top,
      y1: Math.max(...members.map((r) => r.y + r.h)) + PAD.bottom,
    };
    for (const r of all)
      if (r.col === col && r.node.region !== key && r.y < band.y1 && r.y + r.h > band.y0)
        throw new Error(`${title}: "${label}" would enclose ${name(r.node)}; keep a region's members together in their column`);
    return [band];
  });
  if (!bands.length) return undefined;
  const top: [number, number, number][] = [];
  const bottom: [number, number, number][] = [];
  bands.forEach((b, k) => {
    const a = bands[k - 1];
    if (a) {
      if (b.i !== a.i + 1 || Math.max(a.y0, b.y0) >= Math.min(a.y1, b.y1))
        throw new Error(`${title}: "${label}" would be two shapes; its members in neighbouring columns must share rows`);
      top.push([a.x1, b.x0, Math.max(a.y0, b.y0)]);
      bottom.push([a.x1, b.x0, Math.min(a.y1, b.y1)]);
    }
    top.push([b.x0, b.x1, b.y0]);
    bottom.push([b.x0, b.x1, b.y1]);
  });
  const corners: Point[] = [
    ...top.flatMap(([x0, x1, y]): Point[] => [[x0, y], [x1, y]]),
    ...bottom.reverse().flatMap(([x0, x1, y]): Point[] => [[x1, y], [x0, y]]),
  ];
  // Drop repeated and collinear corners, so every edge is one segment.
  const points = corners.filter((p, i) => {
    const prev = corners.at(i - 1)!;
    const next = corners[(i + 1) % corners.length];
    return !((prev[0] === p[0] && p[0] === next[0]) || (prev[1] === p[1] && p[1] === next[1]));
  });
  const last = bands.at(-1)!;
  return { points, label: { tone: "small", x: last.x1 - LABEL_OFFSET, anchor: "end", lines: [{ text: label, y: last.y0 + LINE.label }] } };
}

const edges = (points: Point[]): Segment[] => points.map((p, i) => [p, points[(i + 1) % points.length]]);

/** Baseline of the first of a node's centred lines; 12 is the cap-height offset that centres Geist at these sizes. */
const firstBaseline = (r: Placed) => cy(r) - (LINE.label * lines(r.node.label).length + LINE.small * lines(r.node.note).length) / 2 + 12;

/**
 * The stretches of a lane or stem between `a` and `b` that no region edge cuts. A wire label sits on the stretch at
 * its party's end when that holds it, else on the longest, so it never crosses an outline and, inside a region, still
 * sits beside its party.
 */
function freeRun(a: number, b: number, cuts: readonly number[], partyEnd: "a" | "b", need: number): readonly [number, number] {
  const stops = [a, ...cuts.filter((c) => a < c && c < b).sort((p, q) => p - q), b];
  const runs = stops.slice(1).map((s, i) => [stops[i], s] as const);
  const atParty = partyEnd === "a" ? runs[0] : runs.at(-1)!;
  return atParty[1] - atParty[0] >= need ? atParty : runs.reduce((best, run) => (run[1] - run[0] > best[1] - best[0] ? run : best));
}

export function layout(gen: Generation<string>): Drawing {
  const west = stack(gen.callers, "west");
  const east = stack(gen.upstreams, "east");
  const hubH = Math.max(80, west.extent, east.extent) + 2 * HUB_PAD;
  const hub: Placed = { node: gen.hub, col: "hub", ...COL.hub, y: -hubH / 2, h: hubH };
  const [above, below] = gen.services;
  const services: (Placed<Party<string>> & { above: boolean })[] = [];
  // A service in a region of its own gets REGION_GAP more stem, as stack() gives the side columns, so its outline and
  // the hub's never share an edge. A service outside every region draws no outline, so it needs none.
  const gap = (s: Party<string>) => SERVICE_GAP + (s.region && s.region !== gen.hub.region ? REGION_GAP : 0);
  if (above) {
    const h = height(above);
    services.push({ node: above, col: "hub", ...COL.hub, h, y: hub.y - gap(above) - h, above: true });
  }
  if (below) services.push({ node: below, col: "hub", ...COL.hub, h: height(below), y: hub.y + hubH + gap(below), above: false });
  const all: Placed[] = [hub, ...services, ...west.placed, ...east.placed];
  const top = Math.min(...all.map((r) => r.y - (r.node.region ? PAD.top : 0)));
  for (const r of all) r.y += M - top;
  const H = Math.ceil(Math.max(...all.map((r) => r.y + r.h + (r.node.region ? PAD.bottom : 0))) + M);

  const regions = Object.entries<string>(gen.regions).flatMap(([key, title]) => {
    const r = region(gen.title, key, title, all);
    return r ? [{ key, title, ...r, edges: edges(r.points) }] : [];
  });
  const regionEdges = regions.flatMap((g) => g.edges);

  // Above a lane, stacked upward, on the free run at the party's end (callers to the west, upstreams to the east).
  const overLane = (x0: number, x1: number, y: number, partyEnd: "a" | "b", via: Lines): Text => {
    const ls = lines(via);
    const cuts = regionEdges.filter(([[ax, ay], [bx, by]]) => ax === bx && Math.min(ay, by) < y && y < Math.max(ay, by)).map(([[x]]) => x);
    const need = Math.max(...ls.map((l) => width(l, PX.small))) + LABEL_OFFSET + CLEAR;
    const [a, b] = freeRun(x0, x1, cuts, partyEnd, need);
    const x = partyEnd === "a" ? a + LABEL_OFFSET : b - LABEL_OFFSET;
    return { tone: "small", x, anchor: partyEnd === "a" ? "start" : "end", lines: ls.map((text, k) => ({ text, y: y - LABEL_OFFSET - (ls.length - 1 - k) * LINE.small })) };
  };
  // Beside a stem, centred on the free run at the service's end.
  const besideStem = (x: number, y0: number, y1: number, partyEnd: "a" | "b", via: Lines): Text => {
    const ls = lines(via);
    const cuts = regionEdges.filter(([[ax, ay], [bx, by]]) => ay === by && Math.min(ax, bx) < x && x < Math.max(ax, bx)).map(([[, y]]) => y);
    const [a, b] = freeRun(y0, y1, cuts, partyEnd, ls.length * LINE.small + 2 * CLEAR);
    const first = (a + b) / 2 + PX.small - (ls.length * LINE.small) / 2;
    return { tone: "small", x: x + LABEL_OFFSET, anchor: "start", lines: ls.map((text, k) => ({ text, y: first + k * LINE.small })) };
  };
  const stemX = hub.x + hub.w / 2;
  const wires = [
    ...west.placed.map((c) => ({ party: c.node, seg: [[c.x + c.w, cy(c)], [hub.x, cy(c)]] as Segment, via: overLane(c.x + c.w, hub.x, cy(c), "a", c.node.via) })),
    ...east.placed.map((u) => ({ party: u.node, seg: [[hub.x + hub.w, cy(u)], [u.x, cy(u)]] as Segment, via: overLane(hub.x + hub.w, u.x, cy(u), "b", u.node.via) })),
    ...services.map((s) => {
      const [from, to] = s.above ? [hub.y, s.y + s.h] : [hub.y + hub.h, s.y];
      return { party: s.node, seg: [[stemX, from], [stemX, to]] as Segment, via: besideStem(stemX, Math.min(from, to), Math.max(from, to), s.above ? "a" : "b", s.node.via) };
    }),
  ];

  const nodeTexts = all.flatMap((r): Text[] => {
    const x = r.x + r.w / 2;
    const first = firstBaseline(r);
    const label = lines(r.node.label);
    const texts: Text[] = [{ tone: r === hub ? "hub" : "name", x, anchor: "middle", lines: label.map((text, k) => ({ text, y: first + LINE.label * k })) }];
    const note = lines(r.node.note);
    if (note.length) texts.push({ tone: "small", x, anchor: "middle", lines: note.map((text, k) => ({ text, y: first + LINE.label * label.length + LINE.small * k })) });
    return texts;
  });

  const problems: string[] = [];
  for (const r of all) {
    const fits = (line: string, w: number) => {
      if (w > r.w - 2 * INSET) problems.push(`"${line}" is ${w.toFixed(1)}px, wider than its ${r.w - 2 * INSET}px box`);
    };
    for (const line of lines(r.node.label)) fits(line, r === hub ? width(line, PX.hub, 700) : width(line, PX.label));
    for (const line of lines(r.node.note)) fits(line, width(line, PX.small));
  }
  const labels = [...wires.map((w) => ({ text: w.via, own: w.seg })), ...regions.map((g) => ({ text: g.label, own: undefined }))];
  labels.forEach(({ text, own }, i) => {
    const box = bounds(text);
    const said = `"${text.lines.map((l) => l.text).join(" ")}"`;
    for (const r of all) if (overlaps(box, r)) problems.push(`${said} touches ${name(r.node)}`);
    for (const o of labels.slice(i + 1)) if (overlaps(box, bounds(o.text))) problems.push(`${said} touches "${o.text.lines[0].text}"`);
    for (const w of wires) if (w.seg !== own && overlaps(box, segmentRect(w.seg))) problems.push(`${said} touches the lane to ${name(w.party)}`);
    for (const g of regions) for (const e of g.edges) if (overlaps(box, segmentRect(e))) problems.push(`${said} crosses the edge of "${g.title}"`);
  });
  for (const g of regions)
    if (g.points.some(([x, y]) => x < 0 || x > W || y < 0 || y > H)) problems.push(`the outline of "${g.title}" leaves the drawing`);
  for (const w of wires)
    for (const g of regions) {
      const lane = segmentRect(w.seg);
      const crossings = g.edges.filter((e) => touches(lane, segmentRect(e))).length;
      const expected = (gen.hub.region === g.key) !== (w.party.region === g.key) ? 1 : 0;
      if (crossings !== expected) problems.push(`the lane to ${name(w.party)} crosses the edge of "${g.title}" ${crossings} times, not ${expected}`);
    }
  if (problems.length) throw new Error(`${gen.title}: ${problems.join("; ")}`);

  return {
    height: H,
    regions: regions.map((g) => ({ d: `M${g.points.map((p) => p.join(" ")).join(" L")} Z` })),
    wires: wires.map((w) => ({ d: path(w.seg), to: name(w.party), failover: w.party.failover ?? false })),
    nodes: all.map((r) => ({ x: r.x, y: r.y, w: r.w, h: r.h, hub: r === hub })),
    texts: [...regions.map((g) => g.label), ...wires.map((w) => w.via), ...nodeTexts],
  };
}
