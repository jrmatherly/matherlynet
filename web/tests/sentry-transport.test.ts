import { describe, expect, it, vi } from "vitest";
import { gateTransport } from "../src/lib/sentry";

describe("gateTransport", () => {
  it("drops every envelope while off and forwards while on", async () => {
    const inner = { send: vi.fn().mockResolvedValue({}), flush: vi.fn().mockResolvedValue(true) };
    let on = false;
    const t = gateTransport(inner, () => on);
    await t.send([{}, []] as never);
    expect(inner.send).not.toHaveBeenCalled();
    on = true;
    await t.send([{}, []] as never);
    expect(inner.send).toHaveBeenCalledOnce();
  });
});
