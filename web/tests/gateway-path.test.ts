import { describe, expect, it } from "vitest";
import { FRAMES, draw } from "../src/lib/gateway-path";

const { wide, stacked } = FRAMES;
const texts = (lines: readonly { text: string }[]) => lines.map((l) => l.text);
const kinds = ["passed", "tool", "passed", "cached", "passed", "tool", "refused", "passed", "tool", "passed"];

describe("draw", () => {
  it("draws the wide frame: ten requests in table order, each on a lane from its caller", () => {
    const figure = draw(wide);
    expect(figure.viewBox).toBe("0 0 520 308");
    expect(figure.motion.pulses.map((p) => p.kind)).toEqual(kinds);
    expect(figure.motion.pulses[0].dots[0].motion.path).toBe("M130 44 C153 44 153 110 176 110 H344 C370 110 370 70 396 70");
    expect(figure.motion.pulses[3].dots[0].motion.keyPoints).toBe("0;0;0.5;0.5;1;1");
    expect(figure.callers[1].label).toEqual({ tone: "text12", x: 68, anchor: "middle", lines: [{ text: "Claude Desktop", y: 96 }] });
    expect(figure.glow).toEqual({ x: 182, y: 40, w: 156, h: 108 });
  });

  it("draws the stacked frame from the same table, with the lanes running down the page and names at 11px on two lines", () => {
    const figure = draw(stacked);
    expect(figure.viewBox).toBe("0 0 240 402");
    expect(figure.wrap).toBe("sm:hidden");
    expect(figure.motion.pulses.map((p) => p.kind)).toEqual(kinds);
    expect(figure.motion.pulses[0].dots[0].motion.path).toBe("M30 48 C30 74 106 74 106 100 V268 C106 290 110 290 110 312");
    expect(figure.callers[1].label).toEqual({ tone: "text11", x: 90, anchor: "middle", lines: [{ text: "Claude", y: 25 }, { text: "Desktop", y: 40 }] });
    // The AI drop leaves the box's right edge and falls between the Foundry and MCP server boxes to the audit log.
    expect(figure.wires.at(-1)).toBe("M118 266 H150 M150 266 V362 M160 256 V362");
  });

  it("refuses a phone frame wider than the drawing area of a 320px phone", () => {
    expect(() => draw({ ...stacked, view: { w: 300, h: 402 } })).toThrow(/300-unit frame is wider than 246/);
  });

  it("refuses a label that touches a lane or another label, naming both", () => {
    const onLine = { dx: 0, dy: 4, anchor: "end" } as const;
    const [[sso], ...rest] = stacked.ai.gates;
    expect(() => draw({ ...stacked, ai: { ...stacked.ai, gates: [[sso, onLine], ...rest] } })).toThrow(/"SSO" touches a lane/);
    const lower = { ...stacked.mcp.title, lines: [{ text: "MCP", y: 140 }, { text: "Gateway", y: 154 }] };
    expect(() => draw({ ...stacked, mcp: { ...stacked.mcp, title: lower } })).toThrow(/"MCP Gateway" touches "OAuth"/);
  });

  it("refuses a gateway line that leaves its box and a drop that floats off a box or stops short of the audit log", () => {
    expect(() => draw({ ...wide, ai: { ...wide.ai, to: 360 } })).toThrow(/"AI Gateway"'s line leaves its box/);
    const floating = [[118, 286], [150, 286], [150, 362]] as const;
    expect(() => draw({ ...stacked, drops: [floating, stacked.drops[1]] })).toThrow(/drop 1 starts at \[118, 286\], not on a gateway box's edge/);
    const short = [[160, 256], [160, 340]] as const;
    expect(() => draw({ ...stacked, drops: [stacked.drops[0], short] })).toThrow(/drop 2 ends at y 340, not on the audit log's top edge \(362\)/);
  });

  it("refuses a check that no request crosses: a gate at the line's end is never passed", () => {
    const [sso, rate, guardrails, cache, [, place]] = stacked.ai.gates;
    expect(() => draw({ ...stacked, ai: { ...stacked.ai, gates: [sso, rate, guardrails, cache, [stacked.ai.to, place]] } })).toThrow(/no request lights Routing/);
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

  it("refuses a drop that bends diagonally, leaves the drawing or lands beside the audit log", () => {
    const diagonal = [[118, 266], [150, 362]] as const;
    expect(() => draw({ ...stacked, drops: [diagonal, stacked.drops[1]] })).toThrow(/drop 1 runs diagonally from \[118, 266\] to \[150, 362\]/);
    const high = [[244, 250], [244, -10], [244, 268]] as const;
    expect(() => draw({ ...wide, drops: [wide.drops[0], high] })).toThrow(/drop 2 has a point at \[244, -10\] outside the 520x308 drawing/);
    const beside = [[160, 256], [160, 300], [239, 300], [239, 362]] as const;
    expect(() => draw({ ...stacked, drops: [stacked.drops[0], beside] })).toThrow(/drop 2 ends at x 239, beside the audit log \(x 6 to 234\)/);
  });

  it("refuses audit marks that leave the log or touch its label", () => {
    const marksAt = (x0: number) => ({ ...wide, audit: { ...wide.audit, marks: { ...wide.audit.marks, x0 } } });
    expect(() => draw(marksAt(260))).toThrow(/the audit marks leave the audit log/);
    expect(() => draw(marksAt(40))).toThrow(/the audit marks touch "Audit log"/);
  });

  it("refuses two boxes that overlap and a gateway line that passes through another box", () => {
    expect(() => draw({ ...wide, targets: { ...wide.targets, across: [70, 100, 222] } })).toThrow(/the "Azure AI Foundry" box overlaps the "Anthropic" box/);
    expect(() => draw({ ...wide, mcp: { ...wide.mcp, box: { ...wide.mcp.box, y: 100 } } })).toThrow(/"AI Gateway"'s line passes through the "MCP Gateway" box/);
  });

  it("refuses a check label that reaches its dot", () => {
    const close = { dx: 0, dy: 14, anchor: "middle" } as const;
    const [sso, [rate], ...rest] = wide.ai.gates;
    expect(() => draw({ ...wide, ai: { ...wide.ai, gates: [sso, [rate, close], ...rest] } })).toThrow(/"Rate limits" touches the "Rate limits" dot/);
  });

  it("rejects a frame with the wrong number of callers, targets or checks at compile time", () => {
    // @ts-expect-error three positions for four callers
    const callers: typeof wide.callers = { ...wide.callers, across: [44, 92, 140] };
    // @ts-expect-error two positions for three targets
    const targets: typeof wide.targets = { ...wide.targets, across: [70, 222] };
    // @ts-expect-error one check for two MCP gates
    const mcp: typeof wide.mcp = { ...wide.mcp, gates: [wide.mcp.gates[0]] };
    expect([callers.across.length, targets.across.length, mcp.gates.length]).toEqual([3, 2, 1]);
  });
});
