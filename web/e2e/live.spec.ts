import { randomUUID } from "node:crypto";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

// /playground's live path. The suite runs against either stack: with the model URL unset (the off pass) or pointed at
// web/tests/fake-llama.ts (the live pass), and each test skips itself on the other. Every test calls as its own
// cf-connecting-ip, so the hourly limit can't leak between tests or runs. In order, one at a time: the slow test holds
// the site's seats, and any other live call running beside it would be refused "busy".
test.describe.configure({ mode: "default" });

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
  test.beforeEach(async ({ request }) => test.skip(await liveStack(request), "the stack has a model URL"));

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
  test.beforeEach(async ({ request }) => test.skip(!(await liveStack(request)), "the stack has no model URL"));

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
    await send("my email is a@b.co");
    await expect(page.locator("[data-answer-box]")).toBeHidden();
    await expect(closing).toHaveText("Refused at Guardrails. Nothing reached a model. It was simulated in your browser and was not sent.");
    await expect(page.locator("[data-yours] li", { hasText: "personal data" }).first()).toBeVisible();
    await expect(newestLog).toHaveAttribute("data-v", "refused");
    expect(requests).toEqual([]);
  });

  test("the 11th request in an hour is refused at Rate limits", async ({ request }) => {
    const ip = randomUUID();
    for (let i = 1; i <= 10; i++) expect((await events(await post(request, ip, "hello"))).at(-1), `call ${i}`).toMatchObject({ logged: true, decision: { verdict: "forwarded" } });
    const refused = await events(await post(request, ip, "hello"));
    expect(refused.find((e) => e.step?.gate === "Rate limits")).toMatchObject({ step: { verdict: "refused", why: "hourly" } });
    expect(refused.at(-1)).toMatchObject({ type: "end", decision: { verdict: "refused", at: "Rate limits" } });
  });

  test("of four slow calls at once, exactly three take a seat and one is busy", async ({ request }) => {
    const streams = await Promise.all([1, 2, 3, 4].map(async () => events(await post(request, randomUUID(), "[slow] hello"))));
    for (const stream of streams) expect(stream.filter((e) => e.type === "end")).toHaveLength(1);
    const routing = streams.map((stream) => stream.find((e) => e.step?.gate === "Routing")?.step);
    expect(routing.filter((step) => step?.verdict === "routed")).toHaveLength(3);
    expect(routing.filter((step) => step?.why === "busy")).toHaveLength(1);
  });
});

test("the route takes only same-origin form posts", async ({ request }) => {
  const json = await request.post("/api/playground", { data: { text: "hello", caller: "End users" }, headers: { Origin: self(),"cf-connecting-ip": randomUUID() } });
  expect(json.status()).toBe(415);
  expect((await post(request, randomUUID(), "hello", "https://evil.example")).status()).toBe(403);
});
