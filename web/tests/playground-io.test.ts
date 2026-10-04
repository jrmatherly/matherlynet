import { createHmac } from "node:crypto";
import { EventEmitter } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { DrizzleQueryError, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AI_GATES } from "../src/data/gateway";
import {
  type Call,
  type CallId,
  type Closing,
  IN_FLIGHT_MAX,
  type Io,
  type ModelEvent,
  ModelRefused,
  type VisitorKey,
  liveIo,
  liveModelOn,
  parseCall,
  report,
  respond,
  run,
  visitorKey,
} from "../src/lib/playground-io";
import { LIVE, type LiveEvent, type Load, literal, sseFrames } from "../src/lib/playground";
import { POST } from "../src/pages/api/playground";
import { FAKE_ANSWER, startFakeLlama } from "./fake-llama";

const { captureError, execute, connect } = vi.hoisted(() => ({ captureError: vi.fn(), execute: vi.fn(), connect: vi.fn() }));
vi.mock("../src/db", () => ({ playgroundDb: { execute, $client: { connect } } }));
vi.mock("../src/lib/sentry", () => ({ captureError }));

/** Each report as Sentry received it: "<message> (<code>)". */
const reported = () => captureError.mock.calls.map(([error, extra]) => `${(error as Error).message} (${(extra as { code: string }).code})`);

const FREE: Load = { mineInFlight: 0, mineThisHour: 1, siteToday: 0, mineFreesInMs: 3_600_000, siteFreesInMs: null };

const call = (text: string, enteredAt = performance.now()): Call => ({
  visitor: "h:0123456789abcdef0123456789abcdef" as VisitorKey,
  signedIn: false,
  caller: "End users",
  text: literal(text),
  enteredAt,
});

const aborted = (signal: AbortSignal) =>
  new Promise<never>((_, reject) => {
    if (signal.aborted) reject(signal.reason);
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  });

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => ((resolve = res), (reject = rej)));
  return { promise, resolve, reject };
};

type Model = (signal: AbortSignal) => AsyncIterable<ModelEvent>;

/** Answers with these tokens, then a finish. */
const answering =
  (tokens = ["Hel", "lo"], finish: ModelEvent | null = { type: "finish", reason: "stop", tokens: { in: 9, out: 2 } }): Model =>
  async function* () {
    for (const text of tokens) yield { type: "text", text };
    if (finish) yield finish;
  };
/** Sends the first token, then waits for the signal. */
const stalling =
  (tokens: string[] = ["Hel"]): Model =>
  async function* (signal) {
    for (const text of tokens) yield { type: "text", text };
    await aborted(signal);
  };
const throwing =
  (error: unknown, tokens: string[] = []): Model =>
  async function* () {
    for (const text of tokens) yield { type: "text", text };
    throw error;
  };

interface Script {
  open?: () => Promise<{ id: CallId; load: Load | null }>;
  claim?: () => Promise<boolean>;
  close?: () => Promise<void>;
  model?: Model | null;
}

/** An Io that records every call and argument. `iteratedAfter` is the calls made before the model was first read. */
function fakeIo(script: Script = {}) {
  const calls: string[] = [];
  const storageArgs: unknown[] = [];
  const closes: { id: CallId; closing: Closing }[] = [];
  const closed = deferred<void>();
  const rec = { calls, storageArgs, closes, closed: closed.promise, modelSignal: null as AbortSignal | null, iteratedAfter: null as string[] | null };
  const io: Io = {
    open: async (opening) => {
      calls.push("open");
      storageArgs.push(opening);
      return script.open ? script.open() : { id: 1 as CallId, load: FREE };
    },
    claim: async (id) => {
      calls.push("claim");
      storageArgs.push(id);
      return script.claim ? script.claim() : true;
    },
    close: async (id, closing) => {
      calls.push("close");
      storageArgs.push(id, closing);
      closes.push({ id, closing });
      closed.resolve();
      return script.close?.();
    },
    model: (_text, signal) => {
      calls.push("model");
      rec.modelSignal = signal;
      if (script.model === null) return null;
      const model = script.model ?? answering();
      return {
        [Symbol.asyncIterator]() {
          rec.iteratedAfter = [...calls];
          return model(signal)[Symbol.asyncIterator]();
        },
      };
    },
  };
  return Object.assign(rec, { io });
}

async function runIt(text: string, io: Io, signal = new AbortController().signal, onEvent?: (event: LiveEvent) => void) {
  const events: LiveEvent[] = [];
  await run(call(text), io, signal, (event) => {
    events.push(event);
    onEvent?.(event);
  });
  return events;
}

const stepsOf = (events: LiveEvent[]) => events.flatMap((e) => (e.type === "step" ? [e.step] : []));
const endOf = (events: LiveEvent[]) => events.find((e) => e.type === "end");

beforeEach(() => {
  captureError.mockReset();
  execute.mockReset();
  connect.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("run", () => {
  beforeEach(() => vi.useFakeTimers());

  it("an answered call emits five steps, the text and end; the row is opened first and closed last, once", async () => {
    const f = fakeIo();
    const events = await runIt("hello", f.io);
    expect(events).toEqual([
      { type: "step", step: { gate: "SSO", verdict: "anonymous" } },
      { type: "step", step: { gate: "Rate limits", verdict: "passed", left: 9 } },
      { type: "step", step: { gate: "Guardrails", verdict: "passed" } },
      { type: "step", step: { gate: "Cache", verdict: "off" } },
      { type: "step", step: { gate: "Routing", verdict: "routed", to: "phi-4-mini" } },
      { type: "text", text: "Hel" },
      { type: "text", text: "lo" },
      { type: "end", decision: { verdict: "forwarded", to: "phi-4-mini" }, finish: "stop", logged: true },
    ]);
    expect(stepsOf(events).map((s) => s.gate)).toEqual([...AI_GATES]);
    expect(f.calls).toEqual(["open", "model", "claim", "close"]);
    expect(f.iteratedAfter).toEqual(["open", "model", "claim"]);
    expect(f.closes).toEqual([
      { id: 1, closing: { decision: { verdict: "forwarded", to: "phi-4-mini" }, reason: "stop", replyChars: 5, tokens: { in: 9, out: 2 } } },
    ]);
  });

  const PRE = ["open", "close"];
  const OFF = ["open", "model", "close"];
  const SEAT = ["open", "model", "claim", "close"];
  const refusals: [string, Script & { text?: string }, string, Closing["reason"], boolean, string[], string[]][] = [
    // name, script, refusing gate, reason, whether the model was read, the Io calls, what run() reported
    ["one at a time", { open: async () => ({ id: 1 as CallId, load: { ...FREE, mineInFlight: 1 } }) }, "Rate limits", "one at a time", false, PRE, []],
    ["hourly", { open: async () => ({ id: 1 as CallId, load: { ...FREE, mineThisHour: 11 } }) }, "Rate limits", "hourly", false, PRE, []],
    ["site daily", { open: async () => ({ id: 1 as CallId, load: { ...FREE, siteToday: LIVE.sitePerDay } }) }, "Rate limits", "site daily", false, PRE, []],
    ["a guardrail finding", { text: "my key AKIAABCDEFGHIJKLMNOP" }, "Guardrails", "secrets", false, PRE, []],
    ["model off", { model: null }, "Routing", "model off", false, OFF, []],
    ["busy", { claim: async () => false }, "Routing", "busy", false, SEAT, []],
    ["claim throws", { claim: async () => Promise.reject(new Error("down")) }, "Routing", "unavailable", false, SEAT, ["playground: claim failed (Error)"]],
    ["ModelRefused unavailable", { model: throwing(new ModelRefused("unavailable")) }, "Routing", "unavailable", true, SEAT, []],
    ["ModelRefused model error", { model: throwing(new ModelRefused("model error")) }, "Routing", "model error", true, SEAT, []],
    ["a 200 with no frames", { model: answering([], null) }, "Routing", "model error", true, SEAT, ["playground: model failed (empty stream)"]],
    ["an unexpected model error", { model: throwing(new TypeError("fetch failed")) }, "Routing", "unavailable", true, SEAT, ["playground: model failed (TypeError)"]],
  ];

  it.each(refusals)("%s: one close, refused at that gate with that reason", async (_name, script, gate, reason, read, calls, reports) => {
    const f = fakeIo(script);
    const events = await runIt(script.text ?? "hello", f.io);
    expect(f.closes).toEqual([{ id: 1, closing: { decision: { verdict: "refused", at: gate }, reason, replyChars: null, tokens: null } }]);
    expect(endOf(events)).toEqual({ type: "end", decision: { verdict: "refused", at: gate }, finish: null, logged: true });
    expect(events.some((e) => e.type === "text")).toBe(false);
    expect(f.iteratedAfter).toEqual(read ? ["open", "model", "claim"] : null);
    expect(f.calls).toEqual(calls);
    expect(reported()).toEqual(reports);
  });

  it("when open rejects, Rate limits refuses 'unavailable', nothing else runs and the page is told logged: false", async () => {
    const f = fakeIo({ open: async () => Promise.reject(new Error("ECONNREFUSED")) });
    const events = await runIt("hello", f.io);
    expect(events).toEqual([
      { type: "step", step: { gate: "SSO", verdict: "anonymous" } },
      { type: "step", step: { gate: "Rate limits", verdict: "refused", retryMs: LIVE.totalMs, why: "unavailable" } },
      { type: "end", decision: { verdict: "refused", at: "Rate limits" }, finish: null, logged: false },
    ]);
    expect(f.calls).toEqual(["open"]);
  });

  it("when open gives a row but no load, Rate limits refuses 'unavailable', the row is closed so, and the page is told logged: true", async () => {
    const f = fakeIo({ open: async () => ({ id: 4 as CallId, load: null }) });
    const events = await runIt("hello", f.io);
    expect(events).toEqual([
      { type: "step", step: { gate: "SSO", verdict: "anonymous" } },
      { type: "step", step: { gate: "Rate limits", verdict: "refused", retryMs: LIVE.totalMs, why: "unavailable" } },
      { type: "end", decision: { verdict: "refused", at: "Rate limits" }, finish: null, logged: true },
    ]);
    expect(f.closes).toEqual([{ id: 4, closing: { decision: { verdict: "refused", at: "Rate limits" }, reason: "unavailable", replyChars: null, tokens: null } }]);
    expect(f.calls).toEqual(["open", "close"]);
  });

  it("when open hangs until the signal aborts, the call ends at once, and a row that lands later is closed as cut", async () => {
    const opening = deferred<{ id: CallId; load: Load }>();
    const f = fakeIo({ open: () => opening.promise });
    const stop = new AbortController();
    const done = runIt("hello", f.io, stop.signal);
    stop.abort("left");
    const events = await done;
    expect(endOf(events)).toEqual({ type: "end", decision: { verdict: "refused", at: "Rate limits" }, finish: null, logged: false });
    expect(f.calls).toEqual(["open"]);
    opening.resolve({ id: 7 as CallId, load: FREE });
    await f.closed;
    expect(f.closes).toEqual([{ id: 7, closing: { decision: { verdict: "cut" }, reason: "left", replyChars: null, tokens: null } }]);
  });

  it.each([
    ["deadline", [{ code: "slow" }]],
    ["left", []],
  ])("an open still pending when the signal aborts with %s: a slow open is reported only at the deadline", async (why, reports) => {
    const f = fakeIo({ open: () => new Promise(() => {}) });
    const stop = new AbortController();
    const done = runIt("hello", f.io, stop.signal);
    stop.abort(why);
    await done;
    expect(captureError.mock.calls.map(([, extra]) => extra)).toEqual(reports);
  });

  it("a late open that rejects is reported at stage open, with no close and no unhandled rejection", async () => {
    const opening = deferred<{ id: CallId; load: Load }>();
    const f = fakeIo({ open: () => opening.promise });
    const stop = new AbortController();
    const done = runIt("hello", f.io, stop.signal);
    stop.abort("deadline");
    await done;
    expect(reported()).toEqual(["playground: open failed (slow)"]);
    opening.reject(new Error("down"));
    await vi.runAllTimersAsync();
    expect(f.calls).toEqual(["open"]);
    expect(reported()).toEqual(["playground: open failed (slow)", "playground: open failed (Error)"]);
  });

  it.each([
    ["the first-byte timer", null],
    ["the deadline", "deadline"],
  ])("a model that fails with ModelRefused once %s fires is refused 'no answer in time', not cut or unavailable", async (_name, abortWith) => {
    // What modelStream does when its signal aborts before the headers.
    const f = fakeIo({
      model: async function* (signal) {
        await aborted(signal).catch(() => {});
        throw new ModelRefused("unavailable");
      },
    });
    const stop = new AbortController();
    const done = runIt("hello", f.io, stop.signal);
    if (abortWith) {
      await vi.advanceTimersByTimeAsync(500);
      stop.abort(abortWith);
    } else await vi.advanceTimersByTimeAsync(LIVE.firstByteMs);
    await done;
    expect(f.closes).toEqual([
      { id: 1, closing: { decision: { verdict: "refused", at: "Routing" }, reason: "no answer in time", replyChars: null, tokens: null } },
    ]);
  });

  const onCache = (leave: () => void) => (e: LiveEvent) => e.type === "step" && e.step.gate === "Cache" && leave();
  const leaving: [
    string,
    Script,
    // How the visitor leaves: on an event, or after the call has started.
    (stop: AbortController) => { onEvent?: (event: LiveEvent) => void; after?: () => Promise<void> },
    number | null,
    { calls: string[]; iteratedAfter: string[] | null; modelAborted: boolean | null },
  ][] = [
    ["before Routing", {}, (stop) => ({ onEvent: onCache(() => stop.abort("left")) }), null, { calls: PRE, iteratedAfter: null, modelAborted: null }],
    [
      "during the claim",
      { claim: () => new Promise<boolean>(() => {}) },
      (stop) => ({ onEvent: onCache(() => queueMicrotask(() => stop.abort("left"))) }),
      null,
      { calls: SEAT, iteratedAfter: null, modelAborted: true },
    ],
    [
      "before the first word",
      { model: stalling([]) },
      (stop) => ({ after: async () => (await vi.advanceTimersByTimeAsync(500), stop.abort("left")) }),
      null,
      { calls: SEAT, iteratedAfter: ["open", "model", "claim"], modelAborted: true },
    ],
    [
      "mid-answer",
      { model: stalling(["Hel"]) },
      (stop) => ({ onEvent: (e) => e.type === "text" && stop.abort("left") }),
      3,
      { calls: SEAT, iteratedAfter: ["open", "model", "claim"], modelAborted: true },
    ],
  ];

  it.each(leaving)("the visitor leaving %s: exactly one close, cut, reason left; the model's signal aborted", async (_name, script, leave, replyChars, expected) => {
    const f = fakeIo(script);
    const stop = new AbortController();
    const { onEvent, after } = leave(stop);
    const done = runIt("hello", f.io, stop.signal, onEvent);
    await after?.();
    const events = await done;
    expect(f.closes).toEqual([{ id: 1, closing: { decision: { verdict: "cut" }, reason: "left", replyChars, tokens: null } }]);
    expect(endOf(events)).toMatchObject({ decision: { verdict: "cut" }, logged: true });
    expect({ calls: f.calls, iteratedAfter: f.iteratedAfter, modelAborted: f.modelSignal?.aborted ?? null }).toEqual(expected);
  });

  it("a claim that rejects after the visitor left is reported at stage claim", async () => {
    const claiming = deferred<boolean>();
    const f = fakeIo({ claim: () => claiming.promise });
    const stop = new AbortController();
    const events = await runIt("hello", f.io, stop.signal, onCache(() => queueMicrotask(() => stop.abort("left"))));
    expect(endOf(events)).toEqual({ type: "end", decision: { verdict: "cut" }, finish: null, logged: true });
    expect(reported()).toEqual([]);
    claiming.reject(new Error("down"));
    await vi.runAllTimersAsync();
    expect(reported()).toEqual(["playground: claim failed (Error)"]);
  });

  it("a claim still pending at the deadline is reported as slow", async () => {
    const f = fakeIo({ claim: () => new Promise(() => {}) });
    const stop = new AbortController();
    const events = await runIt("hello", f.io, stop.signal, onCache(() => queueMicrotask(() => stop.abort("deadline"))));
    expect(endOf(events)).toMatchObject({ decision: { verdict: "cut" } });
    expect(reported()).toEqual(["playground: claim failed (slow)"]);
  });

  it("no first event within firstByteMs: Routing 'no answer in time', and the model's signal is aborted", async () => {
    const f = fakeIo({ model: stalling([]) });
    const stop = new AbortController();
    const done = runIt("hello", f.io, stop.signal);
    await vi.advanceTimersByTimeAsync(LIVE.firstByteMs - 1);
    expect(f.modelSignal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const events = await done;
    expect(stepsOf(events).at(-1)).toEqual({ gate: "Routing", verdict: "refused", why: "no answer in time" });
    expect(f.closes.map((c) => c.closing.reason)).toEqual(["no answer in time"]);
    expect(f.modelSignal?.aborted).toBe(true);
    expect(stop.signal.aborted).toBe(false);
  });

  it("the deadline mid-answer: forwarded, finish 'deadline', the characters sent are counted, end is sent", async () => {
    const f = fakeIo({ model: stalling(["Hel"]) });
    const stop = new AbortController();
    const events = await runIt("hello", f.io, stop.signal, (e) => e.type === "text" && stop.abort("deadline"));
    expect(f.closes).toEqual([{ id: 1, closing: { decision: { verdict: "forwarded", to: "phi-4-mini" }, reason: "deadline", replyChars: 3, tokens: null } }]);
    expect(endOf(events)).toEqual({ type: "end", decision: { verdict: "forwarded", to: "phi-4-mini" }, finish: "deadline", logged: true });
  });

  it("a stream that ends with no finish event is forwarded 'dropped', not reported", async () => {
    const f = fakeIo({ model: answering(["Hel"], null) });
    const events = await runIt("hello", f.io);
    expect(endOf(events)).toMatchObject({ decision: { verdict: "forwarded" }, finish: "dropped" });
    expect(captureError).not.toHaveBeenCalled();
  });

  it("a model that throws mid-answer is forwarded 'dropped' and reported", async () => {
    const f = fakeIo({ model: throwing(Object.assign(new Error("terminated"), { code: "UND_ERR_SOCKET" }), ["Hel"]) });
    const events = await runIt("hello", f.io);
    expect(endOf(events)).toMatchObject({ decision: { verdict: "forwarded" }, finish: "dropped", logged: true });
    expect(captureError).toHaveBeenCalledWith(new Error("playground: stream failed"), { code: "UND_ERR_SOCKET" });
  });

  it("a ModelRefused mid-answer is forwarded 'dropped', and run() does not report it a second time", async () => {
    const f = fakeIo({ model: throwing(new ModelRefused("model error"), ["Hel"]) });
    const events = await runIt("hello", f.io);
    expect(endOf(events)).toEqual({ type: "end", decision: { verdict: "forwarded", to: "phi-4-mini" }, finish: "dropped", logged: true });
    expect(reported()).toEqual([]);
  });

  it("a close that rejects: end.logged false, and run() still resolves", async () => {
    const f = fakeIo({ close: async () => Promise.reject(new Error("down")) });
    const events = await runIt("hello", f.io);
    expect(endOf(events)).toMatchObject({ decision: { verdict: "forwarded" }, logged: false });
  });

  it("a close slower than closeMs: end is sent at closeMs with logged false, and the slow close is reported", async () => {
    const f = fakeIo({ close: () => new Promise<void>(() => {}) });
    const events: LiveEvent[] = [];
    const done = run(call("hello"), f.io, new AbortController().signal, (e) => events.push(e));
    await vi.advanceTimersByTimeAsync(LIVE.closeMs - 1);
    expect(endOf(events)).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    await done;
    expect(endOf(events)).toMatchObject({ logged: false });
    expect(reported()).toEqual(["playground: close failed (slow)"]);
  });
});

describe("liveIo storage", () => {
  const visitor = "h:0123456789abcdef0123456789abcdef" as VisitorKey;
  const opening = { visitor, caller: "End users" as const, promptChars: 5 };
  const counts = { mine_in_flight: "0", mine_this_hour: "1", mine_frees_in_ms: "1000.4", site_today: "2", site_frees_in_ms: null };

  it("open: the row's id and the load, parsed from the count", async () => {
    execute.mockResolvedValueOnce({ rows: [{ id: 5 }] }).mockResolvedValueOnce({ rows: [counts] });
    await expect(liveIo.open(opening)).resolves.toEqual({
      id: 5,
      load: { mineInFlight: 0, mineThisHour: 1, siteToday: 2, mineFreesInMs: 1001, siteFreesInMs: null },
    });
  });

  const missing: Record<string, unknown> = { ...counts };
  delete missing.site_today;

  it.each([
    ["the count fails", () => Promise.reject(Object.assign(new Error("down"), { code: "57P01" })), "57P01"],
    ["a count row is missing a column", async () => ({ rows: [missing] }), "no count"],
  ])("open: when %s, the row's id with no load, reported, and nothing else is sent", async (_name, count, code) => {
    execute.mockResolvedValueOnce({ rows: [{ id: 5 }] }).mockImplementationOnce(count);
    await expect(liveIo.open(opening)).resolves.toEqual({ id: 5, load: null });
    expect(reported()).toEqual([`playground: open failed (${code})`]);
    expect(execute).toHaveBeenCalledTimes(2);
  });

  const client = (query: (text: string) => Promise<unknown>) => {
    const fake = { query: vi.fn((config: { text: string }) => query(config.text)), release: vi.fn() };
    connect.mockResolvedValueOnce(fake);
    return fake;
  };
  const seated = async (text: string) => ({ rows: text.includes("update playground_call") ? [{ id: 5 }] : [] });

  it("claim: seats the row inside one transaction and returns its client to the pool", async () => {
    const fake = client(seated);
    await expect(liveIo.claim(5 as CallId)).resolves.toBe(true);
    expect(fake.query.mock.calls.map(([config]) => config.text.trim().split(/\s+/).slice(0, 2).join(" "))).toEqual([
      "begin",
      "select pg_advisory_xact_lock($1)",
      "update playground_call",
      "commit",
    ]);
    expect(fake.release.mock.calls).toEqual([[]]);
  });

  it("claim: no row updated is false, and the client goes back to the pool", async () => {
    const fake = client(async () => ({ rows: [] }));
    await expect(liveIo.claim(5 as CallId)).resolves.toBe(false);
    expect(fake.release.mock.calls).toEqual([[]]);
  });

  it("claim: a BEGIN that fails rejects, and the client is destroyed rather than reused", async () => {
    const fake = client(async (text) => (text === "begin" ? Promise.reject(new Error("dead socket")) : seated(text)));
    await expect(liveIo.claim(5 as CallId)).rejects.toMatchObject({ cause: { message: "dead socket" } });
    expect(fake.release.mock.calls).toEqual([[true]]);
  });
});

async function allEvents(res: Response): Promise<LiveEvent[]> {
  const events: LiveEvent[] = [];
  for await (const data of sseFrames(res.body!)) events.push(JSON.parse(data));
  return events;
}

describe("respond", () => {
  beforeEach(() => vi.useFakeTimers());

  it("a cancelled stream still closes the row, once, as cut, and aborts the model", async () => {
    const f = fakeIo({ model: stalling(["Hel"]) });
    const res = respond(call("hello"), new AbortController().signal, f.io);
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    expect(res.headers.get("cache-control")).toBe("no-cache, no-transform");
    for await (const data of sseFrames(res.body!)) if ((JSON.parse(data) as LiveEvent).type === "text") break;
    await res.body!.cancel();
    await f.closed;
    expect(f.calls).toEqual(["open", "model", "claim", "close"]);
    expect(f.closes).toEqual([{ id: 1, closing: { decision: { verdict: "cut" }, reason: "left", replyChars: 3, tokens: null } }]);
    expect(f.modelSignal?.aborted).toBe(true);
    expect(JSON.stringify(f.storageArgs)).not.toContain("hello");
  });

  it("a request already aborted: the call is cut before the model and its row closed as cut", async () => {
    const f = fakeIo();
    const res = respond(call("hello"), AbortSignal.abort(), f.io);
    const events = await allEvents(res);
    expect(endOf(events)).toMatchObject({ decision: { verdict: "cut" } });
    expect(f.calls).toEqual(["open", "close"]);
    expect(f.closes).toEqual([{ id: 1, closing: { decision: { verdict: "cut" }, reason: "left", replyChars: null, tokens: null } }]);
  });

  it("the deadline counts from call.enteredAt", async () => {
    const f = fakeIo({ model: stalling(["Hel"]) });
    const res = respond(call("hello", performance.now() - (LIVE.totalMs - 500)), new AbortController().signal, f.io);
    const events = allEvents(res);
    await vi.advanceTimersByTimeAsync(500);
    expect(endOf(await events)).toEqual({ type: "end", decision: { verdict: "forwarded", to: "phi-4-mini" }, finish: "deadline", logged: true });
  });

  // Each held call stalls mid-answer until its deadline.
  const hold = (f = fakeIo({ model: stalling(["Hel"]) })) => respond(call("hello"), new AbortController().signal, f.io);
  const fill = (n = IN_FLIGHT_MAX) => Array.from({ length: n }, () => hold());

  it("the playground's own pool holds one connection per call a process admits", async () => {
    const { playgroundDb } = await vi.importActual<typeof import("../src/db")>("../src/db");
    expect(playgroundDb.$client.options.max).toBe(IN_FLIGHT_MAX);
  });

  it("both pools listen for a dropped idle connection, so a Postgres restart can't end the process, and both time out", async () => {
    const { db, playgroundDb } = await vi.importActual<typeof import("../src/db")>("../src/db");
    for (const pool of [db.$client, playgroundDb.$client]) {
      expect(pool.listenerCount("error")).toBe(1);
      expect(pool.options).toMatchObject({ connectionTimeoutMillis: 5_000, statement_timeout: 10_000, query_timeout: 15_000 });
    }
  });

  it("every client of both pools listens for 'error', so a socket that drops while checked out can't end the process", async () => {
    const { db, playgroundDb } = await vi.importActual<typeof import("../src/db")>("../src/db");
    for (const pool of [db.$client, playgroundDb.$client]) {
      const client = new EventEmitter();
      pool.emit("connect", client);
      // An "error" with no listener throws, which in production is an uncaught exception.
      expect(client.emit("error", new Error("reset"))).toBe(true);
    }
  });

  it("a token already in flight when the visitor cancels is dropped quietly: the row is cut and nothing is reported", async () => {
    const f = fakeIo({
      model: async function* (signal) {
        yield { type: "text", text: "Hel" };
        await new Promise((r) => setTimeout(r, 30));
        yield { type: "text", text: "lo" };
        await aborted(signal);
      },
    });
    const res = respond(call("hello"), new AbortController().signal, f.io);
    for await (const data of sseFrames(res.body!)) if ((JSON.parse(data) as LiveEvent).type === "text") break;
    await res.body!.cancel();
    await vi.advanceTimersByTimeAsync(30);
    await f.closed;
    expect(f.closes.map(({ closing }) => [closing.decision, closing.reason, closing.replyChars])).toEqual([[{ verdict: "cut" }, "left", 3]]);
    expect(reported()).toEqual([]);
  });

  it("at six calls in flight, one per connection in the playground's pool: 503 without touching Io; settled calls free their places", async () => {
    expect(IN_FLIGHT_MAX).toBe(6);
    expect(fill().map((res) => res.status)).toEqual(Array(6).fill(200));
    const refused = fakeIo();
    const res = respond(call("hello"), new AbortController().signal, refused.io);
    expect(res.status).toBe(503);
    expect(res.body).toBeNull();
    expect(refused.calls).toEqual([]);
    await vi.advanceTimersByTimeAsync(LIVE.totalMs + LIVE.closeMs);
    // All IN_FLIGHT_MAX places are free again, and no more.
    expect(fill().map((res) => res.status)).toEqual(Array(IN_FLIGHT_MAX).fill(200));
    expect(hold().status).toBe(503);
    await vi.advanceTimersByTimeAsync(LIVE.totalMs + LIVE.closeMs);
  });

  it("a call ended by cancel frees its place", async () => {
    const f = fakeIo({ model: stalling(["Hel"]) });
    const first = hold(f);
    fill(IN_FLIGHT_MAX - 1);
    expect(hold().status).toBe(503);
    await vi.waitFor(() => expect(f.calls).toContain("claim"));
    await first.body!.cancel();
    await f.closed;
    await vi.advanceTimersByTimeAsync(0);
    const res = respond(call("hello"), new AbortController().signal, fakeIo().io);
    expect(res.status).toBe(200);
    expect(endOf(await allEvents(res))).toMatchObject({ decision: { verdict: "forwarded" } });
    expect([hold().status, hold().status]).toEqual([200, 503]);
    await vi.advanceTimersByTimeAsync(LIVE.totalMs + LIVE.closeMs);
  });

  it("every Io method throwing: the stream still ends with end and closes normally", async () => {
    const boom = async () => Promise.reject(new Error("boom"));
    for (const script of [{ open: boom }, { claim: boom, close: boom }, { model: throwing(new Error("boom")), close: boom }] as Script[]) {
      const res = respond(call("hello"), new AbortController().signal, fakeIo(script).io);
      const events = await allEvents(res);
      expect(events.at(-1)).toMatchObject({ type: "end", logged: false });
    }
  });
});

describe("leaks", () => {
  // Passes the guardrails ("sk-" then a hyphen is no key shape), so it reaches every path up to the model.
  const CANARY = "sk-canary-q7w8e9r0t1y2u3i4";

  it("the prompt never reaches storage, the console, Sentry or a thrown message on any failure path", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const quoting = () => Object.assign(new Error(`params: ${CANARY}`), { cause: { code: "57P01", message: CANARY } });
    const scripts: Script[] = [
      { open: async () => Promise.reject(quoting()) },
      { claim: async () => Promise.reject(quoting()), close: async () => Promise.reject(quoting()) },
      { model: throwing(new SyntaxError(`Unexpected token in ${CANARY}`)) },
      { model: throwing(quoting(), ["Hel"]) },
      { model: stalling([CANARY]) },
      {},
    ];
    const storage: unknown[] = [];
    for (const script of scripts) {
      const f = fakeIo(script);
      const stop = new AbortController();
      const res = respond(call(`please answer ${CANARY}`), stop.signal, f.io);
      const events = allEvents(res);
      await vi.waitFor(() => expect(f.calls.length).toBeGreaterThan(0));
      setTimeout(() => stop.abort(), 20);
      await events;
      storage.push(f.storageArgs);
    }
    expect(JSON.stringify(storage)).not.toContain("canary");
    for (const spy of [log, warn, error, captureError]) {
      for (const arg of spy.mock.calls.flat()) expect(String(arg instanceof Error ? `${arg.message} ${String(arg.cause)}` : JSON.stringify(arg))).not.toContain("canary");
    }
    expect(captureError).toHaveBeenCalled();
  });

  it("report() given a DrizzleQueryError forwards a fixed message and only the code", () => {
    const query = new DrizzleQueryError("insert into playground_call values ($1)", [CANARY], Object.assign(new Error("connection refused"), { code: "ECONNREFUSED" }));
    report("open", query);
    expect(captureError).toHaveBeenCalledWith(new Error("playground: open failed"), { code: "ECONNREFUSED" });
    const [sent] = captureError.mock.calls[0];
    expect((sent as Error).cause).toBeUndefined();
    expect(vi.mocked(console.error).mock.calls).toEqual([["playground: open failed (ECONNREFUSED)"]]);
  });

  it.each([
    ["timeout exceeded when trying to connect", "pool timeout"],
    ["Query read timeout", "query timeout"],
    ["Connection terminated unexpectedly", "terminated"],
    ["Client has encountered a connection error and is not queryable", "not queryable"],
  ])("report() names pg's uncoded failure '%s' by a short code, not its message", (message, code) => {
    report("open", new DrizzleQueryError("select 1", [CANARY], new Error(message)));
    expect(captureError.mock.calls).toEqual([[new Error("playground: open failed"), { code }]]);
  });

  it("report() never forwards a code that could be text", () => {
    report("run", { code: `${CANARY} was the prompt, quoted in a code` });
    expect(captureError).toHaveBeenCalledWith(new Error("playground: run failed"), { code: "unknown" });
  });
});

describe("parseCall and the route", () => {
  const url = "http://localhost:4321/api/playground";
  const form = { "content-type": "application/x-www-form-urlencoded" };
  const post = (request: Request) => POST({ request, locals: { user: null } } as unknown as Parameters<typeof POST>[0]) as Promise<Response>;
  const streamOf = (bytes: number, end = true) =>
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(`text=${"a".repeat(bytes - 5)}`));
        if (end) controller.close();
      },
    });

  it.each([
    ["JSON", new Request(url, { method: "POST", headers: { "content-type": "application/json" }, body: '{"text":"hi"}' }), 415],
    ["multipart", new Request(url, { method: "POST", body: (() => { const d = new FormData(); d.set("text", "hi"); return d; })() }), 415],
    ["no content type", new Request(url, { method: "POST", body: new TextEncoder().encode("text=hi&caller=Agents") }), 415],
    ["8193 bytes without Content-Length", new Request(url, { method: "POST", headers: form, body: streamOf(8_193), duplex: "half" } as RequestInit), 413],
    [
      "8193 bytes in two chunks",
      new Request(url, {
        method: "POST",
        headers: form,
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(`text=${"a".repeat(4_091)}`));
            controller.enqueue(new TextEncoder().encode("a".repeat(4_097)));
            controller.close();
          },
        }),
        duplex: "half",
      } as RequestInit),
      413,
    ],
    ["an empty body", new Request(url, { method: "POST", headers: form, body: "" }), 400],
    ["501 characters", new Request(url, { method: "POST", headers: form, body: new URLSearchParams({ text: "a".repeat(501), caller: "Agents" }) }), 400],
    ["an unknown caller", new Request(url, { method: "POST", headers: form, body: new URLSearchParams({ text: "hi", caller: "Nobody" }) }), 400],
  ])("%s: its status, with no body", async (_name, request, status) => {
    const res = await post(request);
    expect(res.status).toBe(status);
    expect(await res.text()).toBe("");
  });

  it("a body stalled for a second: 408", async () => {
    vi.useFakeTimers();
    const pending = post(new Request(url, { method: "POST", headers: form, body: streamOf(10, false), duplex: "half" } as RequestInit));
    await vi.advanceTimersByTimeAsync(1_000);
    const res = await pending;
    expect(res.status).toBe(408);
    expect(await res.text()).toBe("");
  });

  it("a 500-character CJK prompt, form-encoded as the browser sends it, parses", async () => {
    const text = "漢".repeat(500);
    const body = new URLSearchParams({ text, caller: "End users" }).toString();
    expect(body.length).toBeGreaterThan(4_500);
    const parsed = await parseCall(new Request(url, { method: "POST", headers: form, body }), null);
    expect(parsed).toMatchObject({ ok: true, value: { text, caller: "End users" } });
  });

  it("a valid form: the call, with no address in it", async () => {
    vi.stubEnv("BETTER_AUTH_SECRET", "s");
    const request = new Request(url, { method: "POST", headers: { ...form, "cf-connecting-ip": "203.0.113.9" }, body: new URLSearchParams({ text: "  hi  ", caller: "Agents" }) });
    const parsed = await parseCall(request, null);
    expect(parsed).toMatchObject({ ok: true, value: { caller: "Agents", text: "hi", signedIn: false } });
    expect(parsed.ok && parsed.value.visitor).toMatch(/^h:[0-9a-f]{32}$/);
    await expect(parseCall(new Request(url, { method: "POST", headers: form, body: "text=hi&caller=Agents" }), "user-1")).resolves.toMatchObject({
      value: { visitor: "u:user-1", signedIn: true },
    });
  });

  it("the route keys a signed-in caller on the user id, never the email", async () => {
    execute.mockRejectedValue(new Error("down"));
    const request = new Request(url, { method: "POST", headers: form, body: "text=hi&caller=Agents" });
    const res = await (POST({ request, locals: { user: { id: "user-1", email: "owner@example.test" } } } as unknown as Parameters<typeof POST>[0]) as Promise<Response>);
    expect(endOf(await allEvents(res))).toMatchObject({ logged: false });
    const insert = new PgDialect().sqlToQuery(execute.mock.calls[0][0] as SQL);
    expect(insert.params).toContain("u:user-1");
    expect(JSON.stringify(insert.params)).not.toContain("owner@example.test");
  });
});

describe("visitorKey", () => {
  const headers = (ip?: string) => new Headers(ip ? { "cf-connecting-ip": ip } : {});
  const day = new Date("2026-10-03T12:00:00Z");
  beforeEach(() => vi.stubEnv("BETTER_AUTH_SECRET", "secret"));

  it("is the user id when signed in", () => {
    expect(visitorKey(headers("203.0.113.9"), "user-1", day)).toBe("u:user-1");
  });

  it("hashes the address: two addresses differ, neither appears in its key, and no header is one shared key", () => {
    const a = visitorKey(headers("203.0.113.9"), null, day);
    const b = visitorKey(headers("203.0.113.10"), null, day);
    expect(a).toMatch(/^h:[0-9a-f]{32}$/);
    expect(a).not.toBe(b);
    expect(a).not.toContain("203.0.113.9");
    expect(visitorKey(headers(), null, day)).toBe(visitorKey(headers(), null, day));
    expect(visitorKey(headers(), null, day)).not.toBe(a);
  });

  const key = (ip: string) => visitorKey(headers(ip), null, day);
  const hashOf = (subject: string) => `h:${createHmac("sha256", "secret").update(`playground:2026-10-03:${subject}`).digest("hex").slice(0, 32)}`;

  it("hashes an IPv4 address whole", () => {
    expect(key("203.0.113.9")).toBe(hashOf("203.0.113.9"));
  });

  it("reads only cf-connecting-ip: X-Forwarded-For alone is the shared local key", () => {
    expect(visitorKey(new Headers({ "x-forwarded-for": "203.0.113.9" }), null, day)).toBe(hashOf("local"));
  });

  it("keys an IPv6 address on its /64: same prefix, same key; another prefix, another key; never the address", () => {
    const a = key("2001:db8:1:2:aaaa:bbbb:cccc:dddd");
    expect(key("2001:db8:1:2::1")).toBe(a);
    expect(key("2001:0DB8:0001:0002:ffff::")).toBe(a);
    expect(key("2001:db8:1:3::1")).not.toBe(a);
    expect(key("2001:db8:0:2::1")).not.toBe(a);
    expect(a).toMatch(/^h:[0-9a-f]{32}$/);
    expect(a).not.toContain("2001");
  });

  it("expands :: wherever it falls", () => {
    expect(key("::1")).toBe(key("0:0:0:0:ffff::2"));
    expect(key("2001:db8::")).toBe(key("2001:db8:0:0:1:2:3:4"));
    expect(key("::ffff:192.0.2.1")).toBe(key("0:0:0:0:1::"));
    expect(key("2001:db8::1")).not.toBe(key("2001:db9::1"));
  });

  it("hashes an IPv6 string that does not parse as given", () => {
    for (const bad of ["2001:db8::1::2", "2001:db8:1:2:3:4:5:6:7", "2001:db8:1:2", "2001:zz::1", "fe80::1%eth0"]) expect(key(bad)).toBe(hashOf(bad));
  });

  it("rotates daily", () => {
    expect(visitorKey(headers("203.0.113.9"), null, new Date("2026-10-02T12:00:00Z"))).not.toBe(visitorKey(headers("203.0.113.9"), null, day));
  });
});

describe("liveIo.model over real undici against the fake llama", () => {
  let fake: Awaited<ReturnType<typeof startFakeLlama>>;
  beforeAll(async () => (fake = await startFakeLlama()));
  afterAll(() => fake.close());
  beforeEach(() => (fake.received.length = 0));

  const collect = async (text: string, signal = new AbortController().signal) => {
    const events: ModelEvent[] = [];
    for await (const event of liveIo.model(literal(text), signal)!) events.push(event);
    return events;
  };
  const refusal = (text: string) => collect(text).then(() => null, (error: unknown) => error);

  it("sends the measured request and reads the measured stream: text, then finish with the usage tokens", async () => {
    vi.stubEnv("PLAYGROUND_MODEL_URL", fake.url);
    vi.stubEnv("PLAYGROUND_MODEL_KEY", "");
    expect(liveModelOn()).toBe(true);
    expect(await collect("hello")).toEqual([
      ...FAKE_ANSWER.map((text) => ({ type: "text", text })),
      { type: "finish", reason: "stop", tokens: { in: 42, out: FAKE_ANSWER.length } },
    ]);
    const [received] = fake.received;
    expect(received.headers.authorization).toBeUndefined();
    expect(received.body).toEqual({
      model: "phi-4-mini",
      stream: true,
      stream_options: { include_usage: true },
      max_tokens: LIVE.maxTokens,
      temperature: LIVE.temperature,
      messages: [
        { role: "system", content: LIVE.systemPrompt },
        { role: "user", content: "hello" },
      ],
    });
  });

  it("sends the key as a bearer header only when set, and joins /v1 to a base with a trailing slash", async () => {
    vi.stubEnv("PLAYGROUND_MODEL_URL", `${fake.url}/`);
    vi.stubEnv("PLAYGROUND_MODEL_KEY", "k-123");
    await collect("hello");
    expect(fake.received.map((r) => r.headers.authorization)).toEqual(["Bearer k-123"]);
  });

  it.each([
    [400, "model error", [{ code: "http 400" }]],
    [500, "model error", [{ code: "http 500" }]],
    [503, "unavailable", []],
  ])("maps %i to '%s' without reading the body, which quotes the prompt; reports only an unexpected status", async (status, why, reports) => {
    vi.stubEnv("PLAYGROUND_MODEL_URL", fake.url);
    const error = await refusal(`canary [${status}]`);
    expect(error).toBeInstanceOf(ModelRefused);
    expect(error).toMatchObject({ why, message: why });
    expect(captureError.mock.calls.map(([, extra]) => extra)).toEqual(reports);
    expect(JSON.stringify(captureError.mock.calls)).not.toContain("canary");
    expect(vi.mocked(console.error).mock.calls).toEqual(reports.map(({ code }) => [`playground: model failed (${code})`]));
  });

  it("a refused connection is 'unavailable', reported with its code", async () => {
    const closed = createServer();
    await new Promise<void>((r) => closed.listen(0, "127.0.0.1", r));
    const { port } = closed.address() as AddressInfo;
    await new Promise((r) => closed.close(r));
    vi.stubEnv("PLAYGROUND_MODEL_URL", `http://127.0.0.1:${port}`);
    await expect(refusal("hello")).resolves.toMatchObject({ why: "unavailable" });
    expect(reported()).toEqual(["playground: model failed (ECONNREFUSED)"]);
  });

  it("a request that gets no headers is aborted by the signal, and the abort is not reported", async () => {
    vi.stubEnv("PLAYGROUND_MODEL_URL", fake.url);
    const stop = new AbortController();
    setTimeout(() => stop.abort("left"), 100);
    const t0 = Date.now();
    await expect(collect("[stall]", stop.signal)).rejects.toMatchObject({ why: "unavailable" });
    expect(Date.now() - t0).toBeLessThan(1_000);
    expect(reported()).toEqual([]);
  });

  it("an upstream that drops mid-answer: the text so far, then 'unavailable', reported once at stage stream", async () => {
    vi.stubEnv("PLAYGROUND_MODEL_URL", fake.url);
    const events: ModelEvent[] = [];
    const error = await (async () => {
      for await (const event of liveIo.model(literal("hello [drop]"), new AbortController().signal)!) events.push(event);
    })().then(() => null, (thrown: unknown) => thrown);
    expect(events).toEqual([{ type: "text", text: "Hello" }]);
    expect(error).toBeInstanceOf(ModelRefused);
    expect(error).toMatchObject({ why: "unavailable" });
    expect(reported()).toEqual(["playground: stream failed (UND_ERR_SOCKET)"]);
  });

  it("a signal aborted while the next token is pending: 'unavailable', and the abort is not reported", async () => {
    vi.stubEnv("PLAYGROUND_MODEL_URL", fake.url);
    const stop = new AbortController();
    const iterator = liveIo.model(literal("[slow] hello"), stop.signal)![Symbol.asyncIterator]();
    expect(await iterator.next()).toEqual({ done: false, value: { type: "text", text: "Hello" } });
    const pending = iterator.next();
    setTimeout(() => stop.abort("left"), 50);
    await expect(pending).rejects.toMatchObject({ why: "unavailable" });
    expect(reported()).toEqual([]);
  });

  it("sends nothing until the stream is read", async () => {
    vi.stubEnv("PLAYGROUND_MODEL_URL", fake.url);
    const answer = liveIo.model(literal("hello"), new AbortController().signal)!;
    await new Promise((r) => setTimeout(r, 50));
    expect(fake.received).toHaveLength(0);
    await answer[Symbol.asyncIterator]().next();
    expect(fake.received).toHaveLength(1);
  });

  it.each([
    ["[not json]", "a frame that is not JSON"],
    ["[null]", "a frame that is JSON null"],
  ])("%s: %s is 'model error', reported as a bad frame without quoting it", async (mode) => {
    vi.stubEnv("PLAYGROUND_MODEL_URL", fake.url);
    await expect(refusal(`canary ${mode}`)).resolves.toMatchObject({ why: "model error", message: "model error" });
    expect(reported()).toEqual(["playground: model failed (bad frame)"]);
    expect(JSON.stringify([captureError.mock.calls, vi.mocked(console.error).mock.calls])).not.toContain("canary");
  });

  it.each<[string, ModelEvent]>([
    ["[odd content]", { type: "finish", reason: "stop", tokens: { in: 42, out: FAKE_ANSWER.length } }],
    ["[odd usage]", { type: "finish", reason: "stop", tokens: null }],
    ["[length]", { type: "finish", reason: "length", tokens: { in: 42, out: FAKE_ANSWER.length } }],
  ])("%s: only string content is text, tokens only when both are integers, and the finish is the model's", async (mode, finish) => {
    vi.stubEnv("PLAYGROUND_MODEL_URL", fake.url);
    expect(await collect(`hello ${mode}`)).toEqual([...FAKE_ANSWER.map((text) => ({ type: "text", text })), finish]);
    expect(reported()).toEqual([]);
  });

  it("stopping early ends the upstream request, so the slot frees", async () => {
    vi.stubEnv("PLAYGROUND_MODEL_URL", fake.url);
    const iterator = liveIo.model(literal("[slow] hello"), new AbortController().signal)![Symbol.asyncIterator]();
    expect(await iterator.next()).toEqual({ done: false, value: { type: "text", text: "Hello" } });
    await iterator.return!();
    await vi.waitFor(() => expect(fake.received.map((r) => r.cut)).toEqual([true]), { timeout: 1_000 });
  });

  it("refuses a URL that carries credentials, or isn't a URL, with one fixed-text log line", async () => {
    for (const base of [`http://user:hunter2@127.0.0.1:1`, "not a url"]) {
      vi.stubEnv("PLAYGROUND_MODEL_URL", base);
      await expect(refusal("hello")).resolves.toMatchObject({ why: "unavailable" });
    }
    expect(vi.mocked(console.error).mock.calls.flat().join(" ")).not.toContain("hunter2");
    expect(vi.mocked(console.error)).toHaveBeenCalledTimes(2);
    expect(fake.received).toEqual([]);
  });

  it("with the URL unset the model is off: null, and nothing throws", () => {
    vi.stubEnv("PLAYGROUND_MODEL_URL", "");
    expect(liveModelOn()).toBe(false);
    expect(liveIo.model(literal("hello"), new AbortController().signal)).toBeNull();
  });
});
