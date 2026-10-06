import { describe, expect, it } from "vitest";
import { FRAMES, draw, type Frame } from "../src/lib/gateway-path";

const wide: Frame = FRAMES.wide;
const texts = (lines: readonly { text: string }[]) => lines.map((l) => l.text);

describe("draw", () => {
  it("draws the wide frame: ten requests in table order, each on a lane from its caller", () => {
    const figure = draw(wide);
    expect(figure.viewBox).toBe("0 0 520 308");
    expect(figure.motion.pulses.map((p) => p.kind)).toEqual(["passed", "tool", "passed", "cached", "passed", "tool", "refused", "passed", "tool", "passed"]);
    expect(figure.motion.pulses[0].dots[0].motion.path).toBe("M130 44 C153 44 153 110 176 110 H344 C370 110 370 70 396 70");
    expect(figure.motion.pulses[3].dots[0].motion.keyPoints).toBe("0;0;0.5;0.5;1;1");
    expect(figure.callers[1].label).toEqual({ tone: "name", x: 68, anchor: "middle", lines: [{ text: "Claude Desktop", y: 96 }] });
  });

  it("refuses a frame whose lanes run so long that a request ends after the loop", () => {
    expect(() => draw({ ...wide, ai: { ...wide.ai, to: wide.ai.to + 200 } })).toThrow(/needs keyTimes inside the 12s loop/);
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
