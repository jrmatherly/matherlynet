// The live /playground call's server shell: the HTTP boundary, the row in playground_call, the model fetch and the
// response stream. The page script never imports it; everything pure lives in playground.ts.
import { createHmac } from "node:crypto";
import { sql } from "drizzle-orm";
import { CALLERS, type Caller } from "../data/gateway";
import { db } from "../db";
import {
  type Finish,
  LIVE,
  type LiveDecision,
  type LiveEvent,
  type LiveReason,
  type LiveStep,
  type Load,
  parsePrompt,
  preRouting,
  type PromptText,
  type RoutingRefusal,
  type Stop,
  liveDecision,
  liveReason,
  sseFrames,
} from "./playground";
import { captureError } from "./sentry";

declare const callIdBrand: unique symbol;
export type CallId = number & { readonly [callIdBrand]: true };
declare const visitorBrand: unique symbol;
/** "u:<user id>" or "h:<32 hex>". Only visitorKey() makes one. */
export type VisitorKey = string & { readonly [visitorBrand]: true };

/** A parsed, trusted request. Only parseCall() makes one. */
export interface Call {
  readonly visitor: VisitorKey;
  readonly signedIn: boolean;
  readonly caller: Caller;
  readonly text: PromptText;
  /** performance.now() at the route's first statement. The total deadline counts from here. */
  readonly enteredAt: number;
}

/** True when the model URL is set. Read per call: an unset parameter arrives as "". */
export function liveModelOn(): boolean {
  return Boolean(process.env.PLAYGROUND_MODEL_URL);
}

/**
 * Who is calling, for limits and the row. The only code that reads cf-connecting-ip; never Astro.clientAddress, which
 * a client can spoof. Anonymous keys are an HMAC over the UTC date and the address (an IPv6 address's /64), so
 * yesterday's rows can't be linked to today's. With no header (local, E2E) every caller shares the key for "local", so
 * the limiter still works.
 */
export function visitorKey(headers: Headers, userId: string | null, now = new Date()): VisitorKey {
  if (userId) return `u:${userId}` as VisitorKey;
  const ip = headers.get("cf-connecting-ip") ?? "local";
  const mac = createHmac("sha256", process.env.BETTER_AUTH_SECRET ?? "").update(`playground:${now.toISOString().slice(0, 10)}:${prefix64(ip)}`);
  return `h:${mac.digest("hex").slice(0, 32)}` as VisitorKey;
}

const GROUP = /^[0-9a-f]{1,4}$/;
const DOTTED = /^\d{1,3}(\.\d{1,3}){3}$/;

/**
 * An IPv6 address's /64 (its first four groups, "::" expanded), since one subscriber usually holds a whole /64 and can
 * rotate inside it. Anything without ":" (IPv4, "local"), or that does not parse, comes back as given.
 */
function prefix64(ip: string): string {
  if (!ip.includes(":")) return ip;
  const halves = ip.toLowerCase().split("::");
  if (halves.length > 2) return ip;
  const groups = halves.map((half) => (half ? half.split(":") : []));
  const last = groups.at(-1)!;
  // An embedded IPv4 tail (::ffff:192.0.2.1) fills the last two groups, never the first four.
  if (last.length && DOTTED.test(last.at(-1)!)) last.splice(-1, 1, "0", "0");
  const given = groups.flat();
  if (!given.every((g) => GROUP.test(g))) return ip;
  if (halves.length === 1 ? given.length !== 8 : given.length > 7) return ip;
  const full = halves.length === 1 ? given : [...groups[0], ...Array<string>(8 - given.length).fill("0"), ...groups[1]];
  return `${full.slice(0, 4).map((g) => parseInt(g, 16).toString(16)).join(":")}::/64`;
}

export type ParsedCall = { ok: true; value: Call } | { ok: false; status: 400 | 408 | 413 | 415 };
// Bytes. PROMPT_MAX counts UTF-16 units; one form-encodes to at most 9 bytes (a 3-byte character as %XX%XX%XX, and a
// surrogate pair's 4 bytes as 12 over two units), so 500 make 4,500, plus the field names and the caller.
const BODY_MAX = 8_192;
const BODY_MS = 1_000;

/**
 * The HTTP boundary: not a call yet, so no row. Never throws and never quotes the body. Form-encoded only: Astro's
 * origin check covers that type (and no type at all), so a cross-site POST never gets here. Content-Length is not
 * trusted or required; bytes are counted as they arrive.
 */
export async function parseCall(request: Request, userId: string | null): Promise<ParsedCall> {
  const enteredAt = performance.now();
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/x-www-form-urlencoded")) {
    return { ok: false, status: 415 };
  }
  if (!request.body) return { ok: false, status: 400 };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const slow = new Promise<"slow">((resolve) => (timer = setTimeout(resolve, BODY_MS, "slow")));
  try {
    for (;;) {
      const next = await Promise.race([reader.read(), slow]);
      if (next === "slow") {
        reader.cancel().catch(() => {});
        return { ok: false, status: 408 };
      }
      if (next.done) break;
      size += next.value.byteLength;
      if (size > BODY_MAX) {
        reader.cancel().catch(() => {});
        return { ok: false, status: 413 };
      }
      chunks.push(next.value);
    }
  } catch {
    return { ok: false, status: 400 };
  } finally {
    clearTimeout(timer);
  }
  const fields = new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
  const text = parsePrompt(fields.get("text") ?? "");
  const caller = CALLERS.find((c) => c === fields.get("caller"));
  if (!text.ok || !caller) return { ok: false, status: 400 };
  return { ok: true, value: { visitor: visitorKey(request.headers, userId), signedIn: userId !== null, caller, text: text.value, enteredAt } };
}

// ---- The port ----

export interface Tokens {
  in: number;
  out: number;
}

/** What the storage half is told about a new call. No text: only its length. */
export interface Opening {
  visitor: VisitorKey;
  caller: Caller;
  promptChars: number;
}

/** What closes a row. */
export interface Closing {
  decision: LiveDecision;
  reason: LiveReason | null;
  /** Characters of answer sent to the page. null when the model never answered. */
  replyChars: number | null;
  tokens: Tokens | null;
}

/** What the model half yields. llama's chunk JSON never leaves liveIo. */
export type ModelEvent = { type: "text"; text: string } | { type: "finish"; reason: "stop" | "length"; tokens: Tokens | null };

/** Thrown by Io.model's iterable. The message is the enum value and nothing else, never upstream text. */
export class ModelRefused extends Error {
  readonly why: Exclude<RoutingRefusal, "model off" | "busy" | "no answer in time">;
  constructor(why: ModelRefused["why"]) {
    super(why);
    this.why = why;
  }
}

/**
 * Everything run() needs from the world: liveIo, and a fake in the tests. No storage method takes PromptText or an
 * address, so no failed query (DrizzleQueryError quotes its parameters), log line or Sentry event can carry either.
 * Methods may throw anything; run() hands what it catches to report() and nothing else.
 */
export interface Io {
  /** Sweeps dead rows, prunes old ones, inserts this call's row, then counts the load once that insert committed. */
  open(opening: Opening): Promise<{ id: CallId; load: Load }>;
  /**
   * Takes a seat under a lock: marks the row routed only while fewer than LIVE.seats open routed rows exist. true when
   * it did. A call refused "busy" never gets routed_at.
   */
  claim(id: CallId): Promise<boolean>;
  /**
   * The one decision. First writer wins: a second close, or one after the sweep, matches no row. Leaves routed_at as
   * it is: a row with routed_at held a seat, whatever its decision, and counts toward the site's day.
   */
  close(id: CallId, closing: Closing): Promise<void>;
  /** null when PLAYGROUND_MODEL_URL is unset. Otherwise an iterable that sends nothing until its first next(). */
  model(text: PromptText, signal: AbortSignal): AsyncIterable<ModelEvent> | null;
}

const staleSecs = LIVE.staleMs / 1000;
// pg_advisory_xact_lock key for seat claims. migrate.mjs holds 727001.
const SEAT_LOCK = 727_002;
type Row = Record<string, unknown>;
const count = (value: unknown) => Number(value ?? 0);

export const liveIo: Io = {
  async open({ visitor, caller, promptChars }) {
    // The sweep and the prune have disjoint predicates, so no row is touched twice in one statement.
    const inserted = await db.execute<Row>(sql`
      with swept as (
        update playground_call set ended_at = now(), decision = 'lost'
         where ended_at is null
           and started_at < now() - make_interval(secs => ${staleSecs})
           and started_at >= now() - make_interval(days => ${LIVE.retentionDays})
      ), pruned as (
        delete from playground_call where started_at < now() - make_interval(days => ${LIVE.retentionDays})
      )
      insert into playground_call (visitor, caller, prompt_chars) values (${visitor}, ${caller}, ${promptChars})
      returning id`);
    const id = Number(inserted.rows[0].id) as CallId;
    // A second statement, after the insert committed: of racing calls, whoever counts last sees every row. Each
    // subquery is one index range: the visitor's on (visitor, started_at), the site's on the partial routed_at index,
    // so a flood of refused calls costs this visitor's rows, not the day's.
    const counted = await db.execute<Row>(sql`
      select
        (select count(*) from playground_call
          where visitor = ${visitor} and started_at > now() - make_interval(secs => ${staleSecs})
            and ended_at is null and id <> ${id}) as mine_in_flight,
        (select count(*) from playground_call
          where visitor = ${visitor} and started_at > now() - interval '1 hour'
            and stopped_at is distinct from 'Rate limits') as mine_this_hour,
        (select 1000 * extract(epoch from min(started_at) + interval '1 hour' - now()) from playground_call
          where visitor = ${visitor} and started_at > now() - interval '1 hour'
            and stopped_at is distinct from 'Rate limits') as mine_frees_in_ms,
        (select count(*) from playground_call where routed_at > now() - interval '1 day') as site_today,
        (select 1000 * extract(epoch from min(routed_at) + interval '1 day' - now()) from playground_call
          where routed_at > now() - interval '1 day') as site_frees_in_ms`);
    const row = counted.rows[0];
    return {
      id,
      load: {
        mineInFlight: count(row.mine_in_flight),
        mineThisHour: count(row.mine_this_hour),
        siteToday: count(row.site_today),
        mineFreesInMs: Math.max(0, Math.ceil(count(row.mine_frees_in_ms))),
        siteFreesInMs: row.site_frees_in_ms === null ? null : Math.max(0, Math.ceil(count(row.site_frees_in_ms))),
      },
    };
  },

  async claim(id) {
    // The lock serializes claims across replicas, so each count sees every earlier claim's commit.
    return db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(${SEAT_LOCK})`);
      const seated = await tx.execute<Row>(sql`
        update playground_call set routed_at = now()
         where id = ${id} and ended_at is null
           and (select count(*) from playground_call
                 where routed_at is not null and ended_at is null
                   and routed_at > now() - make_interval(secs => ${staleSecs})) < ${LIVE.seats}
        returning id`);
      return seated.rows.length > 0;
    });
  },

  async close(id, { decision, reason, replyChars, tokens }) {
    await db.execute(sql`
      update playground_call set
        ended_at = now(), decision = ${decision.verdict}, stopped_at = ${decision.verdict === "refused" ? decision.at : null},
        reason = ${reason}, reply_chars = ${replyChars}, tokens_in = ${tokens?.in ?? null}, tokens_out = ${tokens?.out ?? null}
      where id = ${id} and ended_at is null`);
  },

  model(text, signal) {
    const base = process.env.PLAYGROUND_MODEL_URL;
    return base ? modelStream(base, process.env.PLAYGROUND_MODEL_KEY ?? "", text, signal) : null;
  },
};

interface Chunk {
  choices?: { delta?: { content?: string | null }; finish_reason?: string | null }[];
  usage?: { prompt_tokens: number; completion_tokens: number };
}

// An async generator's body runs at the first next(), so nothing is sent before run() holds a seat.
async function* modelStream(base: string, key: string, text: PromptText, signal: AbortSignal): AsyncGenerator<ModelEvent> {
  let url: URL;
  try {
    url = new URL("v1/chat/completions", base.endsWith("/") ? base : `${base}/`);
  } catch {
    console.error("playground: PLAYGROUND_MODEL_URL is not a URL");
    throw new ModelRefused("unavailable");
  }
  // Outbound spans record url.full, so a credential in the URL would end up in traces.
  if (url.username || url.password) {
    console.error("playground: PLAYGROUND_MODEL_URL carries credentials; put the key in PLAYGROUND_MODEL_KEY");
    throw new ModelRefused("unavailable");
  }
  // Aborted on every exit, normal or not, so the upstream request ends and the llama slot frees at once.
  const done = new AbortController();
  try {
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(key ? { Authorization: `Bearer ${key}` } : {}) },
        body: JSON.stringify({
          model: LIVE.model,
          stream: true,
          stream_options: { include_usage: true },
          max_tokens: LIVE.maxTokens,
          temperature: LIVE.temperature,
          messages: [
            { role: "system", content: LIVE.systemPrompt },
            { role: "user", content: text },
          ],
        }),
        signal: AbortSignal.any([signal, done.signal]),
      });
    } catch {
      throw new ModelRefused("unavailable");
    }
    // Error bodies are never read: whether llama echoes the prompt in them is unknown. 503 is llama loading or full, a
    // normal state; any other status is a misconfiguration worth a report (a 400 too: PROMPT_MAX fits the slot).
    if (res.status === 503) throw new ModelRefused("unavailable");
    if (!res.ok) reportCode("model", `http ${res.status}`);
    if (!res.ok || !res.body) throw new ModelRefused("model error");
    let finish: "stop" | "length" | null = null;
    let tokens: Tokens | null = null;
    try {
      for await (const data of sseFrames(res.body)) {
        if (data === "[DONE]") break;
        let chunk: Chunk;
        try {
          chunk = JSON.parse(data);
        } catch {
          throw new ModelRefused("model error"); // the SyntaxError quotes the frame
        }
        const choice = chunk.choices?.[0];
        if (choice?.delta?.content) yield { type: "text", text: choice.delta.content };
        if (choice?.finish_reason === "stop" || choice?.finish_reason === "length") finish = choice.finish_reason;
        if (chunk.usage) tokens = { in: chunk.usage.prompt_tokens, out: chunk.usage.completion_tokens };
      }
    } catch (error) {
      throw error instanceof ModelRefused ? error : new ModelRefused("unavailable");
    }
    if (finish) yield { type: "finish", reason: finish, tokens };
  } finally {
    done.abort();
  }
}

type Stage = "open" | "claim" | "model" | "stream" | "close" | "run";

/**
 * Tells Sentry and the log that a stage failed, without the caught error: its message may hold the SQL and its
 * parameters (DrizzleQueryError) or upstream text. Only a code goes out: a pg or undici code, a refusal, or a name.
 */
export function report(stage: Stage, error: unknown): void {
  const e = error as { cause?: { code?: unknown }; code?: unknown; name?: unknown } | null | undefined;
  const raw = e?.cause?.code ?? e?.code ?? (error instanceof ModelRefused ? error.why : e?.name);
  reportCode(stage, typeof raw === "string" && /^[\w .-]{1,40}$/.test(raw) ? raw : "unknown");
}

function reportCode(stage: Stage, code: string): void {
  console.error(`playground: ${stage} failed (${code})`);
  captureError(new Error(`playground: ${stage} failed`), { code });
}

/**
 * One live call: opens the row, walks the gates, streams the answer, closes the row with exactly one decision, then
 * emits `end`. Never rejects: every failure is a step or a decision. Its awaits settle on `signal` (whose reason is
 * a Stop) or on their own, so the close runs whether or not anyone is still reading. The row's only closer.
 */
export async function run(call: Call, io: Io, signal: AbortSignal, emit: (event: LiveEvent) => void): Promise<void> {
  const stopped = new Promise<null>((resolve) =>
    signal.aborted ? resolve(null) : signal.addEventListener("abort", () => resolve(null), { once: true }),
  );
  // No port method takes the signal, and the pool's own timeouts outlast the drain. null: the signal won.
  const orStop = <T>(work: Promise<T>): Promise<T | null> => Promise.race([work, stopped]);
  const stopReason = (): Stop | "error" => (signal.aborted ? (signal.reason === "deadline" ? "deadline" : "left") : "error");

  let opened: { id: CallId; load: Load } | null = null;
  try {
    const opening = io.open({ visitor: call.visitor, caller: call.caller, promptChars: call.text.length });
    opened = await orStop(opening);
    if (!opened) {
      if (signal.reason === "deadline") reportCode("open", "slow");
      // The row may still land. Close it as cut rather than leave it to the next open()'s sweep.
      opening.then(
        ({ id }) => io.close(id, { decision: { verdict: "cut" }, reason: stopReason(), replyChars: null, tokens: null }),
        () => {},
      ).catch((error) => report("close", error));
    }
  } catch (error) {
    report("open", error);
  }

  const steps = preRouting(call.signedIn, opened?.load ?? null, call.text);
  for (const step of steps) emit({ type: "step", step });
  // No row, so no call: it could not be logged.
  if (!opened) {
    emit({ type: "end", decision: { verdict: "refused", at: "Rate limits" }, finish: null, logged: false });
    return;
  }

  let finish: Finish | null = null;
  let replyChars: number | null = null;
  let tokens: Tokens | null = null;
  const add = (step: LiveStep) => {
    steps.push(step);
    emit({ type: "step", step });
  };
  const refuse = (why: RoutingRefusal) => add({ gate: "Routing", verdict: "refused", why });
  try {
    if (steps.at(-1)?.verdict === "refused" || signal.aborted) return;

    const firstWord = new AbortController();
    const answer = io.model(call.text, AbortSignal.any([signal, firstWord.signal]));
    if (!answer) return refuse("model off");
    let seat: boolean | null;
    try {
      seat = await orStop(io.claim(opened.id));
    } catch (error) {
      report("claim", error);
      return refuse("unavailable");
    }
    if (seat === null) return;
    if (!seat) return refuse("busy");

    // setTimeout, not AbortSignal.timeout: the tests' fake timers reach it. A queued llama request is silent.
    const timer = setTimeout(() => firstWord.abort(), LIVE.firstByteMs);
    let failure: unknown = null;
    try {
      for await (const event of answer) {
        if (replyChars === null) {
          clearTimeout(timer);
          replyChars = 0;
          add({ gate: "Routing", verdict: "routed", to: LIVE.model });
        }
        if (event.type === "text") {
          replyChars += event.text.length;
          emit({ type: "text", text: event.text });
        } else {
          finish = event.reason;
          tokens = event.tokens;
        }
      }
    } catch (error) {
      failure = error ?? new Error("unknown");
    } finally {
      clearTimeout(timer);
    }

    if (signal.aborted && signal.reason !== "deadline") return; // the visitor left
    const late = firstWord.signal.aborted || signal.aborted;
    if (replyChars === null) {
      if (late) return refuse("no answer in time");
      if (failure instanceof ModelRefused) return refuse(failure.why);
      if (failure) report("model", failure);
      return refuse(failure ? "unavailable" : "model error"); // no failure: a 200 with no frames
    }
    if (finish === null) {
      finish = late ? "deadline" : "dropped";
      if (!late && failure) report("stream", failure);
    }
  } catch (error) {
    report("run", error);
  } finally {
    const decision = liveDecision(steps, finish);
    const reason = liveReason(steps, finish, stopReason());
    // Bounded, so the stream ends inside the drain even when Postgres stalls. A close that lands later still counts;
    // the page was told logged: false.
    let bound: ReturnType<typeof setTimeout> | undefined;
    const logged = await Promise.race([
      io.close(opened.id, { decision, reason, replyChars, tokens }).then(
        () => true,
        (error) => (report("close", error), false),
      ),
      new Promise<false>((resolve) => (bound = setTimeout(resolve, LIVE.closeMs, false))),
    ]);
    clearTimeout(bound);
    emit({ type: "end", decision, finish, logged });
  }
}

// ponytail: per-process cap, since every accepted call writes its row on the pg pool auth shares; move to a shared counter if replicas multiply
// Stays under the pool's 10 connections, so auth keeps some while the playground is flooded.
export const IN_FLIGHT_MAX = LIVE.seats * 2;
let inFlight = 0;

/**
 * The Response. Starts run() from the stream's start() and returns at once. The client-gone signal has two paths,
 * neither trusted alone: requestSignal before the stream is read, cancel() after. Owns the call's deadline.
 */
export function respond(call: Call, requestSignal: AbortSignal, io: Io = liveIo): Response {
  if (inFlight >= IN_FLIGHT_MAX) return new Response(null, { status: 503 });
  const stop = new AbortController();
  const leave = () => stop.abort("left" satisfies Stop);
  // The adapter never times out a reader that stops reading, so the deadline can't depend on the client.
  const deadline = setTimeout(() => stop.abort("deadline" satisfies Stop), Math.max(0, LIVE.totalMs - (performance.now() - call.enteredAt)));
  if (requestSignal.aborted) leave();
  else requestSignal.addEventListener("abort", leave, { once: true });
  let open = true;
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const emit = (event: LiveEvent) => {
        if (open) controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      inFlight++;
      void run(call, io, stop.signal, emit)
        .catch((error) => report("run", error))
        .finally(() => {
          inFlight--;
          clearTimeout(deadline);
          requestSignal.removeEventListener("abort", leave);
          // Always a normal close: an error after the headers becomes "Internal server error" in a 200 body.
          if (open) {
            open = false;
            controller.close();
          }
        });
    },
    // Resolves, never rejects (the adapter console.errors a rejection). It only aborts; run() closes the row.
    cancel() {
      open = false;
      leave();
    },
  });
  return new Response(body, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform" } });
}
