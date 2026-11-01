import { readFileSync } from "node:fs";
import * as Sentry from "@sentry/browser";
import { describe, expect, it } from "vitest";
import { browserSentryOptions, scrubBreadcrumb, scrubEvent, stripQuery } from "../src/lib/scrub-url";

describe("browserSentryOptions", () => {
  // The page script doesn't run under the Astro Container, so this reads its source.
  it("is what the page script passes to Sentry.init", () => {
    expect(readFileSync(new URL("../src/components/Telemetry.astro", import.meta.url), "utf8")).toMatch(/Sentry\.init\(\{[^}]*\.\.\.browserSentryOptions[^}]*\}\)/);
  });

  it("sends an event with no inferred IP and no timezone or locale", async () => {
    const sent: Sentry.ErrorEvent[] = [];
    const client = new Sentry.BrowserClient({
      dsn: "https://k@o1.ingest.sentry.io/1",
      stackParser: Sentry.defaultStackParser,
      transport: () => ({ send: async (envelope) => (sent.push(envelope[1][0]?.[1] as Sentry.ErrorEvent), {}), flush: async () => true }),
      ...browserSentryOptions,
      integrations: browserSentryOptions.integrations(Sentry.getDefaultIntegrations({})),
    });
    client.init();
    client.captureException(new Error("probe"));
    await client.flush(2000);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.sdk?.settings?.infer_ip).toBe("never");
    expect(sent[0]?.contexts?.culture).toBeUndefined();
  });
});

describe("stripQuery", () => {
  it("drops query strings and fragments", () => {
    expect(stripQuery("https://matherly.net/reset-password?token=abc#x")).toBe("https://matherly.net/reset-password");
  });
  it("leaves non-strings alone", () => {
    expect(stripQuery(undefined)).toBeUndefined();
  });
});

describe("scrubEvent", () => {
  it("keeps only paths in the request URL and Referer and drops the query string", () => {
    const event = scrubEvent({
      request: {
        url: "https://matherly.net/reset-password?token=abc",
        headers: { Referer: "https://matherly.net/reset-password?token=abc", "User-Agent": "x" },
        query_string: "token=abc",
      },
    });
    expect(event.request).toEqual({
      url: "https://matherly.net/reset-password",
      headers: { Referer: "https://matherly.net/reset-password", "User-Agent": "x" },
    });
  });
  it("strips stack frame filenames, which can hold the page URL", () => {
    const event = scrubEvent({
      exception: { values: [{ stacktrace: { frames: [{ filename: "https://matherly.net/reset-password?token=abc", lineno: 1 }, { function: "f" }] } }] },
    });
    expect(event.exception?.values?.[0]?.stacktrace?.frames).toEqual([{ filename: "https://matherly.net/reset-password", lineno: 1 }, { function: "f" }]);
  });
  it("passes events without a request through", () => {
    expect(scrubEvent({ message: "m" })).toEqual({ message: "m" });
  });
});

describe("scrubBreadcrumb", () => {
  it("strips url, from and to", () => {
    const crumb = scrubBreadcrumb({
      category: "navigation",
      data: { from: "/reset-password?token=abc", to: "/sign-in#t", url: "/api/x?token=1", status_code: 200 },
    });
    expect(crumb.data).toEqual({ from: "/reset-password", to: "/sign-in", url: "/api/x", status_code: 200 });
  });
  it("leaves breadcrumbs without data alone", () => {
    expect(scrubBreadcrumb({ message: "click" })).toEqual({ message: "click" });
  });
});
