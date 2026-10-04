import { randomUUID } from "node:crypto";
import { setTimeout as wait } from "node:timers/promises";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import pg from "pg";
import { LIVE, sseFrames } from "../src/lib/playground";

// /playground's live path. The suite runs against either stack: with the model URL unset (the off pass) or pointed at
// web/tests/fake-llama.ts (the live pass), and a test for one mode skips itself on the other. Every test calls as its own
// cf-connecting-ip, so the hourly limit can't leak between tests or runs. In order, one at a time: the slow test holds
// the site's seats, the site-daily test fills the site's day, and any other live call running beside them would be
// refused. The live pass reads and seeds playground_call through APPDB_URI (global-setup.ts) and, when it ends, deletes
// every row created while it ran (anyone else's live call on the same stack included), so local runs don't use up the
// site's daily cap.
test.describe.configure({ mode: "default" });

const db = new pg.Pool({ connectionString: process.env.APPDB_URI, max: 2 });
test.afterAll(() => db.end());

// The cleanup deletes by id range, so it runs only against a local database.
const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);
// The default visitor of the rows a test inserts.
const SEED = "e2e-seed";

interface CallRow {
  id: number;
  visitor: string;
  routed_at: Date | null;
  ended_at: Date | null;
  decision: string | null;
  stopped_at: string | null;
  reason: string | null;
  reply_chars: number | null;
  tokens_in: number | null;
  tokens_out: number | null;
}

const query = async <T extends object = CallRow>(text: string, values: unknown[] = []) => (await db.query<T>(text, values)).rows;
const lastId = async () => Number((await query<{ id: string | null }>("select max(id) as id from playground_call"))[0].id ?? 0);
const rowsAfter = (id: number) => query("select * from playground_call where id > $1 order by id", [id]);

// n rows started `ago`, seated then if routed, and closed now when given a decision (the table ties ended_at to it).
const seed = (
  n: number,
  {
    visitor = SEED,
    ago = "0",
    routed = false,
    decision = null,
    stoppedAt = null,
    reason = null,
  }: { visitor?: string; ago?: string; routed?: boolean; decision?: string | null; stoppedAt?: string | null; reason?: string | null } = {},
) =>
  query(
    `insert into playground_call (visitor, caller, prompt_chars, started_at, routed_at, ended_at, decision, stopped_at, reason)
     select $1, 'End users', 5, now() - $2::interval, case when $3 then now() - $2::interval end,
            case when $4::text is not null then now() end, $4, $5, $6 from generate_series(1, $7) returning *`,
    [visitor, ago, routed, decision, stoppedAt, reason, n],
  );

const self = () => new URL(test.info().project.use.baseURL!).origin;

const liveStack = async (request: APIRequestContext) => (await (await request.get("/playground")).text()).includes('data-mode="live"');

// A form POST as the page sends it. Astro's origin check refuses a form POST with no Origin header.
const post = (request: APIRequestContext, ip: string, text: string, origin = self()) =>
  request.post("/api/playground", { form: { text, caller: "End users" }, headers: { Origin: origin, "cf-connecting-ip": ip } });

const events = async (response: Awaited<ReturnType<typeof post>>) =>
  (await response.text())
    .split("\n")
    .filter((line) => line.startsWith("data: "))
    .map((line) => JSON.parse(line.slice(6)));

// The same POST read as it arrives, through Node's fetch, which can stop reading or hang up mid-stream.
const stream = async (ip: string, text: string, signal?: AbortSignal) => {
  const response = await fetch(new URL("/api/playground", self()), {
    method: "POST",
    body: new URLSearchParams({ text, caller: "End users" }),
    headers: { Origin: self(), "cf-connecting-ip": ip },
    signal,
  });
  return (async function* () {
    for await (const data of sseFrames(response.body!)) yield JSON.parse(data);
  })();
};

// Text the guardrails flag: the call opens a row and passes Rate limits, then stops before Routing, so it takes no seat.
const FLAGGED = "my email is a@b.co";

// The row of one flagged call from this address, which holds the visitor key the route derives from it.
const flaggedRow = async (request: APIRequestContext, ip: string) => {
  const before = await lastId();
  await post(request, ip, FLAGGED);
  const [row] = await rowsAfter(before);
  return row;
};

const openConsole = async (page: Page) => {
  const requests: string[] = [];
  page.on("request", (r) => void (new URL(r.url()).pathname === "/api/playground" && requests.push(r.url())));
  await page.setExtraHTTPHeaders({ "cf-connecting-ip": randomUUID() });
  await page.goto("/playground");
  await page.locator("label", { hasText: "Your own request" }).click();
  const send = async (text: string) => {
    await page.getByRole("textbox", { name: "Your request" }).fill(text);
    await page.getByRole("button", { name: "Send" }).click();
  };
  return { requests, send, closing: page.locator('[data-yours] [data-slot="closing"]'), newestLog: page.locator("[data-log] tr").first() };
};

test.describe("model off", () => {
  let live: boolean | null = null;
  test.beforeEach(async ({ request }) => test.skip((live ??= await liveStack(request)), "the stack has a model URL"));

  test("an own request is simulated and never sent", async ({ page }) => {
    const { requests, send, closing } = await openConsole(page);
    await send("hello");
    await expect(closing).toBeVisible();
    expect(requests).toEqual([]);
  });

  test("a direct POST is logged and refused at Routing, model off", async ({ request }) => {
    expect(await events(await post(request, randomUUID(), "hello"))).toEqual([
      { type: "step", step: { gate: "SSO", verdict: "anonymous" } },
      { type: "step", step: { gate: "Rate limits", verdict: "passed", left: 9 } },
      { type: "step", step: { gate: "Guardrails", verdict: "passed" } },
      { type: "step", step: { gate: "Cache", verdict: "off" } },
      { type: "step", step: { gate: "Routing", verdict: "refused", why: "model off" } },
      { type: "end", decision: { verdict: "refused", at: "Routing" }, finish: null, logged: true },
    ]);
  });
});

test.describe("model on", () => {
  let live: boolean | null = null;
  let firstId: number | null = null;
  test.beforeEach(async ({ request }) => {
    test.skip(!(live ??= await liveStack(request)), "the stack has no model URL");
    if (firstId !== null) return;
    if (!LOOPBACK.has(URL.parse(process.env.APPDB_URI ?? "")?.hostname ?? "")) throw new Error("live.spec.ts reads and deletes playground_call rows: set APPDB_URI to a database on localhost, 127.0.0.1 or ::1.");
    // A run killed mid-test leaves its seeds, and 300 of them would refuse every local live call for a day.
    await query("delete from playground_call where visitor = $1", [SEED]);
    firstId = await lastId();
  });
  test.afterAll(async () => {
    if (firstId !== null) await db.query("delete from playground_call where id > $1", [firstId]);
  });

  test("an own request streams the model's answer and is logged", async ({ page }) => {
    const { requests, send, newestLog } = await openConsole(page);
    await send("hello");
    await expect(page.locator("[data-answer]")).toHaveText("Hello from the fake model.");
    await expect(newestLog).toHaveAttribute("data-v", "forwarded");
    await expect(newestLog.locator('[data-slot="endpoint"]')).toHaveText("phi-4-mini");
    await expect(page.locator("[data-yours] [data-logged]")).toBeVisible();
    expect(requests).toHaveLength(1);
  });

  test("flagged text is refused in the browser and never sent", async ({ page }) => {
    const { requests, send, closing, newestLog } = await openConsole(page);
    const answer = page.locator("[data-answer]");
    await send("hello");
    await expect(answer).toHaveText("Hello from the fake model.");
    await expect(closing).toBeVisible();
    requests.length = 0;
    await send(FLAGGED);
    await expect(page.locator("[data-answer-box]")).toBeHidden();
    await expect(closing).toHaveText("Refused at Guardrails. Nothing reached a model. It was simulated in your browser and was not sent.");
    await expect(page.locator("[data-yours] li", { hasText: "personal data" }).first()).toBeVisible();
    await expect(newestLog).toHaveAttribute("data-v", "refused");
    expect(requests).toEqual([]);
  });

  test("an HTTP error from the route is shown under the form", async ({ page }) => {
    await page.route("**/api/playground", (route) => route.fulfill({ status: 503 }));
    const { send } = await openConsole(page);
    await send("hello");
    await expect(page.locator("[data-msg]")).toHaveText("The gateway did not answer (HTTP 503). Try again in a moment.");
  });

  test("a request that never reaches the route says the gateway could not be reached", async ({ page }) => {
    await page.route("**/api/playground", (route) => route.abort());
    const { send } = await openConsole(page);
    await send("hello");
    await expect(page.locator("[data-msg]")).toHaveText("The gateway could not be reached. Check your connection and try again.");
  });

  test("a stream that ends before its end event is logged as cut", async ({ page }) => {
    const body = `data: ${JSON.stringify({ type: "step", step: { gate: "SSO", verdict: "anonymous" } })}\n\n`;
    await page.route("**/api/playground", (route) => route.fulfill({ status: 200, contentType: "text/event-stream", body }));
    const { send, newestLog } = await openConsole(page);
    await send("hello");
    await expect(newestLog).toHaveAttribute("data-v", "cut");
    await expect(page.locator("[data-msg]")).toBeEmpty();
  });

  test("the 11th request in an hour is refused at Rate limits, and each row is closed with its outcome", async ({ request }) => {
    const ip = randomUUID();
    const before = await lastId();
    for (let i = 1; i <= 10; i++) expect((await events(await post(request, ip, "hello"))).at(-1), `call ${i}`).toMatchObject({ logged: true, decision: { verdict: "forwarded" } });
    const refused = await events(await post(request, ip, "hello"));
    const limit = refused.find((e) => e.step?.gate === "Rate limits");
    expect(limit).toMatchObject({ step: { verdict: "refused", why: "hourly" } });
    expect(limit.step.retryMs).toBeGreaterThan(0);
    expect(limit.step.retryMs).toBeLessThanOrEqual(3_600_000);
    expect(refused.at(-1)).toMatchObject({ type: "end", decision: { verdict: "refused", at: "Rate limits" } });

    const rows = await rowsAfter(before);
    expect(rows).toHaveLength(11);
    const answered = rows[0];
    expect(answered).toMatchObject({ decision: "forwarded", reason: "stop", stopped_at: null, tokens_in: 42, tokens_out: 5 });
    expect(answered.reply_chars).toBe("Hello from the fake model.".length);
    expect(answered.routed_at).toBeInstanceOf(Date);
    expect(answered.ended_at).toBeInstanceOf(Date);
    expect(rows[10]).toMatchObject({ decision: "refused", stopped_at: "Rate limits", reason: "hourly", routed_at: null });
  });

  test("rows refused at Rate limits don't count toward the visitor's hour, or set when it frees", async ({ request }) => {
    const ip = randomUUID();
    const { visitor } = await flaggedRow(request, ip);
    await seed(9, { visitor, ago: "50 minutes", decision: "refused", stoppedAt: "Rate limits", reason: "hourly" });
    const second = await events(await post(request, ip, FLAGGED));
    expect(second.find((e) => e.step?.gate === "Rate limits")).toEqual({ type: "step", step: { gate: "Rate limits", verdict: "passed", left: 8 } });
    for (let i = 3; i <= 10; i++) await post(request, ip, FLAGGED);
    const refused = (await events(await post(request, ip, FLAGGED))).find((e) => e.step?.gate === "Rate limits");
    expect(refused).toMatchObject({ step: { verdict: "refused", why: "hourly" } });
    // The oldest counted row is this test's first call, seconds old, not a seeded row 50 minutes old.
    expect(refused.step.retryMs).toBeGreaterThan(55 * 60_000);
  });

  test("rows started more than an hour ago don't count toward the visitor's hour", async ({ request }) => {
    const ip = randomUUID();
    const { id, visitor } = await flaggedRow(request, ip);
    await query("delete from playground_call where id = $1", [id]);
    await seed(10, { visitor, ago: "61 minutes", routed: true, decision: "forwarded", reason: "stop" });
    const next = await events(await post(request, ip, FLAGGED));
    expect(next.find((e) => e.step?.gate === "Rate limits")).toEqual({ type: "step", step: { gate: "Rate limits", verdict: "passed", left: 9 } });
  });

  test("a call from a visitor with an open row is refused one at a time", async ({ request }) => {
    const ip = randomUUID();
    const { visitor } = await flaggedRow(request, ip);
    await seed(1, { visitor });
    const second = await events(await post(request, ip, FLAGGED));
    expect(second.find((e) => e.step?.gate === "Rate limits")).toMatchObject({ step: { verdict: "refused", why: "one at a time" } });
  });

  test("the site's daily cap counts every seated call of the last day, whatever its decision, and no other", async ({ request }) => {
    const seeded: CallRow[] = [];
    try {
      seeded.push(...(await seed(LIVE.sitePerDay, { decision: "refused", stoppedAt: "Routing", reason: "busy" })));
      const unseated = await events(await post(request, randomUUID(), FLAGGED));
      expect(unseated.find((e) => e.step?.gate === "Rate limits")).toMatchObject({ step: { verdict: "passed" } });

      const quarter = LIVE.sitePerDay / 4;
      seeded.push(
        ...(await seed(quarter, { ago: "1 minute", routed: true, decision: "forwarded", reason: "stop" })),
        ...(await seed(quarter, { ago: "1 minute", routed: true, decision: "cut", reason: "left" })),
        ...(await seed(quarter, { ago: "1 minute", routed: true, decision: "lost" })),
        ...(await seed(quarter, { ago: "1 minute", routed: true, decision: "refused", stoppedAt: "Routing", reason: "no answer in time" })),
      );
      const refused = await events(await post(request, randomUUID(), FLAGGED));
      expect(refused.find((e) => e.step?.gate === "Rate limits")).toMatchObject({ step: { verdict: "refused", why: "site daily" } });
    } finally {
      await query("delete from playground_call where id = any($1)", [seeded.map((row) => row.id)]);
    }
  });

  test("an open row past the stale age is swept as lost and keeps its routed_at", async ({ request }) => {
    const [seeded] = await seed(1, { ago: "1 minute", routed: true });
    await post(request, randomUUID(), FLAGGED);
    const [swept] = await query("select * from playground_call where id = $1", [seeded.id]);
    expect(swept.decision).toBe("lost");
    expect(swept.ended_at).toBeInstanceOf(Date);
    expect(swept.routed_at?.getTime()).toBe(seeded.routed_at!.getTime());
  });

  test("rows started more than the retention period ago are deleted, closed or open", async ({ request }) => {
    const ago = `${LIVE.retentionDays + 1} days`;
    const seeded = [...(await seed(1, { ago, decision: "forwarded", reason: "stop" })), ...(await seed(1, { ago }))];
    expect(seeded).toHaveLength(2);
    expect(seeded).toHaveLength(2);
    await post(request, randomUUID(), FLAGGED);
    expect(await query("select id from playground_call where id = any($1)", [seeded.map((row) => row.id)])).toEqual([]);
  });

  test("of four slow calls at once, exactly three take a seat and one is busy", async ({ request }) => {
    const before = await lastId();
    const streams = await Promise.all([1, 2, 3, 4].map(async () => events(await post(request, randomUUID(), "[slow] hello"))));
    for (const stream of streams) expect(stream.filter((e) => e.type === "end")).toHaveLength(1);
    const routing = streams.map((stream) => stream.find((e) => e.step?.gate === "Routing")?.step);
    expect(routing.filter((step) => step?.verdict === "routed")).toHaveLength(3);
    expect(routing.filter((step) => step?.why === "busy")).toHaveLength(1);

    const rows = await rowsAfter(before);
    expect(rows.filter((row) => row.routed_at !== null)).toHaveLength(3);
    expect(rows.filter((row) => row.decision === "refused")).toEqual([
      expect.objectContaining({ stopped_at: "Routing", reason: "busy", routed_at: null }),
    ]);
  });

  test("a visitor who hangs up mid-answer leaves a cut row and can call again at once", async ({ request }) => {
    const ip = randomUUID();
    const before = await lastId();
    const hangUp = new AbortController();
    const answer = await stream(ip, "[slow] hello", hangUp.signal);
    for await (const event of answer) if (event.type === "text") break;
    hangUp.abort();
    await expect.poll(async () => (await rowsAfter(before))[0]?.decision).toBe("cut");
    const [row] = await rowsAfter(before);
    expect(row).toMatchObject({ reason: "left", stopped_at: null });
    expect(row.reply_chars).toBeGreaterThan(0);
    expect(row.routed_at).toBeInstanceOf(Date);
    const next = await events(await post(request, ip, "hello"));
    expect(next.find((e) => e.step?.gate === "Rate limits")).toMatchObject({ step: { verdict: "passed" } });
  });

  test("a seat is claimed under the seat lock", async () => {
    const before = await lastId();
    const lock = await db.connect();
    try {
      await lock.query("begin");
      await lock.query("select pg_advisory_xact_lock(727002)");
      const answer = await stream(randomUUID(), "hello");
      const gates = [];
      for (let i = 0; i < 4; i++) gates.push((await answer.next()).value.step.gate);
      expect(gates).toEqual(["SSO", "Rate limits", "Guardrails", "Cache"]);
      const routing = answer.next();
      expect(await Promise.race([routing, wait(1_000, "waiting")])).toBe("waiting");
      expect((await rowsAfter(before))[0].routed_at).toBeNull();
      await lock.query("commit");
      expect((await routing).value).toEqual({ type: "step", step: { gate: "Routing", verdict: "routed", to: LIVE.model } });
      for await (const event of answer) if (event.type === "end") expect(event.decision).toEqual({ verdict: "forwarded", to: LIVE.model });
    } finally {
      await lock.query("rollback");
      lock.release();
    }
  });

  test("a model that sends nothing for two seconds is refused at Routing", async ({ request }) => {
    const before = await lastId();
    const started = Date.now();
    const refused = await events(await post(request, randomUUID(), "[stall] hello"));
    const took = Date.now() - started;
    expect(refused.find((e) => e.step?.gate === "Routing")).toMatchObject({ step: { verdict: "refused", why: "no answer in time" } });
    expect(took).toBeGreaterThanOrEqual(LIVE.firstByteMs);
    expect(took).toBeLessThan(LIVE.totalMs - 500);
    const [row] = await rowsAfter(before);
    expect(row).toMatchObject({ decision: "refused", stopped_at: "Routing", reason: "no answer in time" });
    expect(row.routed_at).toBeInstanceOf(Date);
  });
});

test("the route takes only same-origin form posts", async ({ request }) => {
  const json = await request.post("/api/playground", { data: { text: "hello", caller: "End users" }, headers: { Origin: self(),"cf-connecting-ip": randomUUID() } });
  expect(json.status()).toBe(415);
  expect((await post(request, randomUUID(), "hello", "https://evil.example")).status()).toBe(403);
});
