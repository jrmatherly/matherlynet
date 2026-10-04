// A stand-in for the llama.cpp server behind /playground's live path, speaking its measured stream: a first chunk with
// null content, one chunk per token, finish_reason on an empty delta, a usage chunk with `choices: []`, then [DONE].
// Vitest imports startFakeLlama(); E2E and a developer run it as `node web/tests/fake-llama.ts <port>`.
// The user message picks the behaviour: "[slow]" (tokens 300 ms apart, so four calls overlap), "[stall]" (never sends
// headers, like a request queued behind four busy slots), "[drop]" (one token, then the connection is destroyed),
// "[400]", "[500]" or "[503]"; frames a client must not trust: "[not json]" (a frame that quotes the prompt and does
// not parse), "[null]" (the frame `null`), "[odd content]" (a numeric content first), "[odd usage]" (a string token
// count); and "[length]" (finishes at the token limit). Anything else is a short answer.
import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { pathToFileURL } from "node:url";

export interface Received {
  headers: IncomingMessage["headers"];
  body: { messages?: { role: string; content: string }[]; [field: string]: unknown };
  /** The client went away before the answer was finished: the slot a real server would free. */
  cut: boolean;
}

export const FAKE_ANSWER = ["Hello", " from", " the", " fake", " model."];
const SLOW_MS = 300;

const chunk = (delta: object, finish: string | null) => ({
  id: "chatcmpl-fake",
  object: "chat.completion.chunk",
  created: 0,
  model: "phi-4-mini",
  choices: [{ index: 0, delta, finish_reason: finish }],
});

export function startFakeLlama(port = 0): Promise<{ url: string; received: Received[]; close: () => Promise<void> }> {
  const received: Received[] = [];
  const server = createServer(async (req, res) => {
    if (req.method !== "POST" || req.url !== "/v1/chat/completions") return void res.writeHead(404).end();
    let raw = "";
    try {
      for await (const part of req) raw += part;
    } catch {
      return; // the client went away mid-body
    }
    let body: Received["body"] = {};
    try {
      body = JSON.parse(raw);
    } catch {
      res.writeHead(500, { "Content-Type": "application/json" }).end('{"error":{"code":500,"message":"malformed JSON"}}');
      return;
    }
    const seen: Received = { headers: req.headers, body, cut: false };
    received.push(seen);
    res.on("close", () => (seen.cut = !res.writableEnded));
    const prompt = body.messages?.find((m) => m.role === "user")?.content ?? "";
    if (prompt.includes("[stall]")) return; // held open until the client goes
    // Error bodies quote the prompt, so a test can prove the client never reads them.
    for (const status of [400, 500, 503]) {
      if (prompt.includes(`[${status}]`)) {
        const error = { code: status, message: `refused: ${prompt}`, type: status === 400 ? "exceed_context_size_error" : "server_error" };
        return void res.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify({ error }));
      }
    }
    const gap = prompt.includes("[slow]") ? SLOW_MS : 0;
    const send = (data: object | string) => res.write(`data: ${typeof data === "string" ? data : JSON.stringify(data)}\n\n`);
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
    send(chunk({ role: "assistant", content: null }, null));
    if (prompt.includes("[not json]")) return void (send(`{"choices":[{"delta":{"content":${JSON.stringify(prompt)}`), res.end());
    if (prompt.includes("[null]")) return void (send("null"), res.end());
    if (prompt.includes("[odd content]")) send(chunk({ content: 42 }, null));
    for (const token of FAKE_ANSWER) {
      if (gap) await new Promise((r) => setTimeout(r, gap));
      if (seen.cut) return;
      send(chunk({ content: token }, null));
      if (prompt.includes("[drop]")) return void setTimeout(() => res.destroy(), 20);
    }
    send(chunk({}, prompt.includes("[length]") ? "length" : "stop"));
    const promptTokens = prompt.includes("[odd usage]") ? "42" : 42;
    send({
      ...chunk({}, null),
      choices: [],
      usage: { completion_tokens: FAKE_ANSWER.length, prompt_tokens: promptTokens, total_tokens: 42 + FAKE_ANSWER.length, prompt_tokens_details: { cached_tokens: 0 } },
      timings: { prompt_ms: 1, predicted_ms: 1, predicted_n: FAKE_ANSWER.length },
    });
    send("[DONE]");
    res.end();
  });
  return new Promise((resolve) =>
    server.listen(port, "127.0.0.1", () => {
      const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      const close = () =>
        new Promise<void>((done) => {
          server.closeAllConnections();
          server.close(() => done());
        });
      resolve({ url, received, close });
    }),
  );
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const { url } = await startFakeLlama(Number(process.argv[2] ?? 18080));
  console.log(`fake-llama listening on ${url}`);
}
