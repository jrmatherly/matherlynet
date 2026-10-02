import type dns from "node:dns";
import type { LookupAddress } from "node:dns";
import https from "node:https";
import { describe, expect, it, vi } from "vitest";
import { gateTransport, publicOnlyLookup } from "../src/lib/sentry";

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

// A dns.lookup stand-in that answers every query with these addresses.
const resolvesTo = (...addresses: LookupAddress[]) =>
  ((_host: string, _options: unknown, callback: (err: null, result: LookupAddress[]) => void) =>
    callback(null, addresses)) as unknown as typeof dns.lookup;

describe("publicOnlyLookup", () => {
  it("refuses a name that resolves to any private address", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const lookup = publicOnlyLookup(resolvesTo({ address: "203.0.113.7", family: 4 }, { address: "10.0.0.5", family: 4 }));
    const error = await new Promise<NodeJS.ErrnoException>((resolve) => {
      https.request({ hostname: "sentry.example.test", lookup }).on("error", resolve).end();
    });
    expect(error.code).toBe("EPRIVATEADDR");
    expect(log.mock.calls.flat().join(" ")).toMatch(/sentry\.example\.test.*10\.0\.0\.5/);
    log.mockRestore();
  });

  it("passes public addresses through in the shape the caller asked for", () => {
    const lookup = publicOnlyLookup(resolvesTo({ address: "203.0.113.7", family: 4 }));
    const all = vi.fn();
    const one = vi.fn();
    lookup("sentry.example.test", { all: true }, all);
    lookup("sentry.example.test", {}, one);
    expect(all).toHaveBeenCalledWith(null, [{ address: "203.0.113.7", family: 4 }]);
    expect(one).toHaveBeenCalledWith(null, "203.0.113.7", 4);
  });

  it("passes resolver errors through and logs them (Sentry's transport drops failures silently)", () => {
    const failing = ((_h: string, _o: unknown, callback: (err: Error) => void) =>
      callback(Object.assign(new Error("nope"), { code: "ENOTFOUND" }))) as unknown as typeof dns.lookup;
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const cb = vi.fn();
    publicOnlyLookup(failing)("sentry.example.test", {}, cb);
    expect(cb.mock.calls[0][0]).toMatchObject({ code: "ENOTFOUND" });
    expect(log.mock.calls.flat().join(" ")).toMatch(/sentry\.example\.test.*ENOTFOUND/);
    log.mockRestore();
  });
});
