import { describe, expect, it } from "vitest";
import { FRAMES, draw, type Frame } from "../src/lib/gateway-path";

const wide: Frame = FRAMES.wide;
const stacked: Frame = FRAMES.stacked;
const texts = (lines: readonly { text: string }[]) => lines.map((l) => l.text);
const kinds = ["passed", "tool", "passed", "cached", "passed", "tool", "refused", "passed", "tool", "passed"];

describe("draw", () => {
  it("draws the wide frame: ten requests in table order, each on a lane from its caller", () => {
    const figure = draw(wide);
    expect(figure.viewBox).toBe("0 0 520 308");
    expect(figure.motion.pulses.map((p) => p.kind)).toEqual(kinds);
    expect(figure.motion.pulses[0].dots[0].motion.path).toBe("M130 44 C153 44 153 110 176 110 H344 C370 110 370 70 396 70");
    expect(figure.motion.pulses[3].dots[0].motion.keyPoints).toBe("0;0;0.5;0.5;1;1");
    expect(figure.callers[1].label).toEqual({ tone: "name", x: 68, anchor: "middle", lines: [{ text: "Claude Desktop", y: 96 }] });
  });

  it("draws the stacked frame from the same table, with the lanes running down the page and names at 11px on two lines", () => {
    const figure = draw(stacked);
    expect(figure.viewBox).toBe("0 0 240 402");
    expect(figure.motion.pulses.map((p) => p.kind)).toEqual(kinds);
    expect(figure.motion.pulses[0].dots[0].motion.path).toBe("M30 48 C30 74 106 74 106 100 V268 C106 290 110 290 110 312");
    expect(figure.callers[1].label).toEqual({ tone: "small", x: 90, anchor: "middle", lines: [{ text: "Claude", y: 25 }, { text: "Desktop", y: 40 }] });
    expect(figure.wires.at(-1)).toBe("M118 286 H150 M150 286 V362 M160 256 V362");
  });

  it("refuses a phone frame wider than the drawing area of a 320px phone", () => {
    expect(() => draw({ ...stacked, view: { w: 300, h: 402 } })).toThrow(/300-unit frame is wider than 246/);
  });

  it("refuses a label that touches a lane or another label, naming both", () => {
    const onLine = { dx: 0, dy: 4, anchor: "end" } as const;
    expect(() => draw({ ...stacked, ai: { ...stacked.ai, labelAt: [onLine, ...stacked.ai.labelAt.slice(1)] } })).toThrow(/"SSO" touches a lane/);
    const lower = { ...stacked.mcp.title, lines: [{ text: "MCP", y: 140 }, { text: "Gateway", y: 154 }] };
    expect(() => draw({ ...stacked, mcp: { ...stacked.mcp, title: lower } })).toThrow(/"MCP Gateway" touches "OAuth"/);
  });

  it("refuses a frame whose lanes run so long that a request ends after the loop", () => {
    expect(() => draw({ ...wide, view: { w: 720, h: 308 }, end: wide.end + 200 })).toThrow(/needs keyTimes inside the 12s loop/);
  });

  it("wraps a name that no longer fits its box on one line, and refuses one that fits on none", () => {
    const narrow = draw({ ...wide, callers: { ...wide.callers, depth: 70 } });
    expect(narrow.callers.map((c) => texts(c.label.lines))).toEqual([["Claude", "Code"], ["Claude", "Desktop"], ["Agents"], ["End users"]]);
    expect(narrow.callers[0].label.lines.map((l) => l.y)).toEqual([41, 56]);
    expect(() => draw({ ...wide, callers: { ...wide.callers, depth: 40 } })).toThrow(/"Claude Code" does not fit 28px wide on two lines/);
  });

  it("refuses a drawing that leaves its viewBox or has too few audit marks for its requests", () => {
    expect(() => draw({ ...wide, view: { w: 500, h: 308 } })).toThrow(/leaves the 500x308 drawing/);
    expect(() => draw({ ...wide, audit: { ...wide.audit, marks: { ...wide.audit.marks, count: 9 } } })).toThrow(/9 marks for 10 requests/);
  });
});
