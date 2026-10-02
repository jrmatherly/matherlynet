# Hardening Follow-ups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every open finding left after PR #2 (production hardening) in one branch and PR:
`hardening-follow-ups`.

**Architecture:** Three independent fixes. (1) The breached-password check moves from better-auth's
`password.hash` wrapper into a plugin `before` hook with an abortable `fetch`, so a refused password no longer burns
a reset link and a timed-out lookup is cancelled. (2) Server Sentry connects through a DNS `lookup` that refuses
private addresses (IPv6 forms that carry an IPv4 address included), so a DSN *name* that resolves into the local
network is blocked at connect time, also when a proxy is configured. (3) A committed Compose override, copied into
the publish output by an AppHost pipeline step, adds the `healthcheck` Aspire's TypeScript SDK can't express.

**Tech Stack:** better-auth 1.7.7, `@sentry/node` 11.1.0, Aspire 13.6.0 (TypeScript AppHost), Docker Compose v5,
Node 24.21, Vitest.

**Spec:** the "Known follow-ups" section of PR #2's body and the completed plan
`docs/superpowers/plans/completed/2026-10-01-production-hardening.md` (Tasks 14, 15, 17). Research for this plan
(2026-10-01) is summarized under "Findings" below; every claim there was checked against installed source,
upstream repositories or a local run.

## Findings (research, 2026-10-01)

| # | Finding | Status | Evidence |
| :--- | :--- | :--- | :--- |
| F1 | A timed-out HIBP lookup isn't aborted | **Fix (Task 1)** | `better-auth/dist/plugins/haveibeenpwned/index.mjs` calls `betterFetch` with no signal or timeout; 1.7.7 is the latest release; upstream fix better-auth#11051 is open, unmerged |
| F2 | **New:** a refused password burns the reset link | **Fix (Task 1)**; dry run passes | `dist/api/routes/password.mjs:155` consumes the token, `:160` hashes (where the HIBP check runs). Reproduced locally with our `boundedPwned`: breached `newPassword` → 400, 0 verification rows left, retry with the same token → 400. Upstream issue better-auth#10632, fix #10717 open, unmerged. Same for our 503 on lookup timeout |
| F3 | DSN check misses names that resolve privately | **Fix (Task 2)** | `settings-form.ts` checks literal addresses only. `@sentry/node` `makeNodeTransport` accepts `httpModule` (`build/types/transports/http.d.ts`); Node's `http(s).request` takes a `lookup` option, which runs on every new connection (also covers a DNS change after the DSN is saved). With `http(s)_proxy` set Sentry's own proxy agent would skip it, and IPv6 forms such as NAT64 `64:ff9b::a00:5` (10.0.0.5) slipped past the old check: both covered |
| F4 | No Compose healthcheck for `web` | **Fix (Task 3), workaround** | Aspire 13.6.0 is the latest release. The C# `Service.Healthcheck` exists upstream but its `Healthcheck` class has no `[AspireExport]`, so the TS SDK's `Service` (`.aspire/modules/aspire.mts`) has no member, on `main` too. No `HEALTHCHECK` in `DockerfileStage`. A fresh `aspire publish` emits none. A `docker-compose.override.yaml` next to the published file merges (verified with `docker compose config`, both `-f` and auto-discovery); `wget` exists in `node:24-alpine` (BusyBox 1.37). An AppHost pipeline step copies it there at publish (output path from `Pipeline:OutputPath`) |
| F5 | `otel.mjs` uses `module.register` (marked deprecated in newer `@types/node`) | **No change** | No runtime warning on Node 24.21, even with `--pending-deprecation`. OpenTelemetry still documents `module.register` (opentelemetry-js#4933). `import-in-the-middle` 3.5 offers `register-hooks.mjs` (sync hooks), but switching means a new direct dependency and a hook-sharing change OpenTelemetry doesn't document. Keep the `ponytail:` note |
| F6 | Site settings reach other replicas within 30 s | **No change** | Documented design choice (`site-settings.ts` `ponytail:`), not a defect |

Out of this PR (no code here): the production deploy (`docs/deployment.md`, needs your go-ahead), the dotfiles
agent-safe shell (completed plan Task 24, other repo), and an upstream Aspire request to export `Healthcheck`
(outward-facing: ask first). See "After merge".

## Global Constraints

- Exact dependency versions; no new dependencies in this plan.
- Double quotes, semicolons, 2-space indentation in `web/`; Markdown at 120 columns, starting with a `#` heading.
- Read runtime config from `process.env`; never `import.meta.env` for run-time values.
- Never edit `out/`, `.aspire/` or `web/drizzle/` by hand.
- Edit files with Edit/Write, not sed/python through Bash (the lint hook only sees those tools).
- Run the app only through Aspire; after dependency or `astro.config.mjs` changes, `aspire resource web restart`.
- This shell has `NODE_ENV=production`: prefix `aspire`/`npm`/`pnpm` commands with `env -u NODE_ENV`.
- Before committing: empty `.claude/auto-memory/dirty-files-*` in a separate Bash call (the auto-memory hook blocks
  commits listing already-committed files).
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Don't push without approval.

## Review Focus

1. **HIBP outage during a password reset:** the user sees "try again", and the same emailed link still works once
   the lookup recovers. Pinned in Task 1 (`keeps the reset link usable…`).
2. **A request body with a non-string password** (JSON `password: 123`, missing field): the hook must not crash or
   call HIBP; the endpoint's own validation answers. Pinned in Task 1 (`passwordFrom` table, `skips non-string`).
3. **Sign-in must not call HIBP** (latency on every login). Pinned in Task 1 (`doesn't check on sign-in`).
4. **A DSN host resolving to both a public and a private address:** refused (any private address blocks). Pinned in
   Task 2 (`refuses a name that resolves to any private address`).
5. **An HIBP outage must still reach Sentry:** the 503 now comes from a before hook, which skips `auth.ts`'s after
   hook; `onAPIError` reports it instead (verified through `auth.handler`). Pinned in Task 1 Step 5
   (`admin-promotion.test.ts`). The `127.0.0.1` Sentry wiring tests keep working (IP literals skip `lookup`).

---

### Task 0: Branch and plan bookkeeping

**Files:** `docs/superpowers/plans/completed/2026-10-01-production-hardening.md` (moved),
`docs/superpowers/plans/2026-10-01-hardening-follow-ups.md` (this file).

- [ ] **Step 1:** Confirm the branch and the staged move: `git branch --show-current` prints `hardening-follow-ups`;
  `git status --short` shows `R  docs/superpowers/plans/2026-10-01-production-hardening.md ->
  docs/superpowers/plans/completed/…`.
- [ ] **Step 2:** `markdownlint-cli2 docs/superpowers/plans/2026-10-01-hardening-follow-ups.md` passes.
- [ ] **Step 3:** Commit:

```bash
git add docs/superpowers/plans
git commit -m "Plans: archive production hardening, add hardening follow-ups

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 1: Breached-password check before the endpoint, with an abortable lookup (F1, F2)

**Files:**

- Rewrite: `web/src/lib/pwned.ts`
- Modify: `web/src/lib/auth.ts` (import, comment above `hooks`, `plugins`)
- Replace tests: delete `web/tests/pwned-real.test.ts`, rewrite `web/tests/pwned.test.ts`
- Modify test: `web/tests/admin-promotion.test.ts` (the HIBP-500 reporting test: now a 503 via `onAPIError`; a
  new test for the after hook, through a failed session insert)
- Docs: `.claude/rules/web-architecture.md` (the `pwned.ts` lines)

**Interfaces:**

- Produces: `pwnedPasswordCheck(timeoutMs?: number): BetterAuthPlugin` (plugin id `pwned-password-check`);
  `breachCount(body: string, suffix: string): number`;
  `passwordFrom(path: string | undefined, body: unknown): string | null`.
- Removes: `boundedPwned`, `withTimeout` (no other importers: `grep -rn "boundedPwned\|withTimeout" web/src web/tests`).

Why a `before` hook: plugin `hooks.before` runs ahead of the endpoint handler with the raw body (`ctx.body`), for
HTTP requests and `auth.api.*` calls alike. Verified with a spike on 1.7.7: a hook refusing `newPassword` on
`/reset-password` left the verification row in place and the same token succeeded on retry. Type:
`@better-auth/core/dist/types/plugin.d.mts` (`hooks.before: { matcher(ctx): boolean; handler: AuthMiddleware }[]`).
Body fields per endpoint (1.7.7 source): `/sign-up/email` `password`; `/admin/create-user` `password`;
`/change-password` `newPassword` (`api/routes/update-user.mjs:160`); `/reset-password` `newPassword`
(`api/routes/password.mjs:151`); `/admin/set-user-password` `newPassword` (`plugins/admin/routes.mjs`).

- [ ] **Step 1: Write the failing tests.** Replace `web/tests/pwned.test.ts` with:

```ts
// pwnedPasswordCheck inside a real betterAuth (memoryAdapter), with fetch standing in for api.pwnedpasswords.com.
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { afterEach, describe, expect, it, vi } from "vitest";
import { breachCount, passwordFrom, pwnedPasswordCheck } from "../src/lib/pwned";

const SAFE = "a-long-unpwned-test-password-91";
// SHA-1("password") = 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8; the range response lists suffixes after the prefix.
const BREACHED = "password";
const BREACHED_RANGE = "0018A45C4D1DEF81644B54AB7F969B88D65:0\r\n1E4C9B93F3F0682250B6CF8331B7EE68FD8:9999\r\n";
const CLEAN_RANGE = "0018A45C4D1DEF81644B54AB7F969B88D65:0\r\n";

// Typed through the generic: unused `_url`/`_init` parameters fail this repo's lint.
const answer = (body: string) =>
  vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () => new Response(body, { status: 200 }));
// Never answers; rejects when aborted, like a real fetch.
const hang = () => {
  const signals: AbortSignal[] = [];
  const fn = vi.fn(
    (_url: string, init?: RequestInit) =>
      new Promise<Response>((_, reject) => {
        const signal = init!.signal!;
        signals.push(signal);
        signal.addEventListener("abort", () => reject(signal.reason));
      }),
  );
  return { fn, signals };
};

function makeAuth(timeoutMs = 200) {
  let resetToken = "";
  const db: Record<string, unknown[]> = { user: [], session: [], account: [], verification: [] };
  const auth = betterAuth({
    baseURL: "http://localhost:4321",
    secret: "test-secret-test-secret-test-secret-123",
    database: memoryAdapter(db),
    emailAndPassword: {
      enabled: true,
      sendResetPassword: async ({ token }) => {
        resetToken = token;
      },
    },
    plugins: [pwnedPasswordCheck(timeoutMs)],
  });
  return { auth, db, resetToken: () => resetToken };
}
const signUp = (auth: ReturnType<typeof makeAuth>["auth"], email: string, password: unknown = SAFE) =>
  auth.api.signUpEmail({ body: { email, password: password as string, name: "T" } });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("breachCount", () => {
  it("reads the count for the matching suffix, case-insensitively", () => {
    expect(breachCount(BREACHED_RANGE, "1E4C9B93F3F0682250B6CF8331B7EE68FD8")).toBe(9999);
    expect(breachCount(BREACHED_RANGE.toLowerCase(), "1E4C9B93F3F0682250B6CF8331B7EE68FD8")).toBe(9999);
  });
  it("counts padding entries and absent suffixes as 0", () => {
    expect(breachCount(BREACHED_RANGE, "0018A45C4D1DEF81644B54AB7F969B88D65")).toBe(0);
    expect(breachCount(CLEAN_RANGE, "1E4C9B93F3F0682250B6CF8331B7EE68FD8")).toBe(0);
  });
  it("throws on a malformed count, so the check fails closed", () => {
    expect(() => breachCount("1E4C9B93F3F0682250B6CF8331B7EE68FD8:lots", "1E4C9B93F3F0682250B6CF8331B7EE68FD8")).toThrow();
  });
});

describe("passwordFrom", () => {
  it("reads the field each password endpoint uses", () => {
    expect(passwordFrom("/sign-up/email", { password: "a" })).toBe("a");
    expect(passwordFrom("/admin/create-user", { password: "b" })).toBe("b");
    expect(passwordFrom("/change-password", { newPassword: "c", currentPassword: "x" })).toBe("c");
    expect(passwordFrom("/reset-password", { newPassword: "d", token: "t" })).toBe("d");
    expect(passwordFrom("/admin/set-user-password", { newPassword: "e", userId: "u" })).toBe("e");
  });
  it("returns null for other paths and for missing, empty or non-string values", () => {
    expect(passwordFrom("/sign-in/email", { password: "a" })).toBeNull();
    expect(passwordFrom(undefined, { password: "a" })).toBeNull();
    expect(passwordFrom("/sign-up/email", { password: 123 })).toBeNull();
    expect(passwordFrom("/sign-up/email", { password: "" })).toBeNull();
    expect(passwordFrom("/sign-up/email", undefined)).toBeNull();
    expect(passwordFrom("/reset-password", { password: "wrong field" })).toBeNull();
  });
});

describe("pwnedPasswordCheck in better-auth", () => {
  it("refuses a breached password, sending only the 5-character hash prefix", async () => {
    const fetch = answer(BREACHED_RANGE);
    vi.stubGlobal("fetch", fetch);
    await expect(signUp(makeAuth().auth, "a@example.test", BREACHED)).rejects.toMatchObject({ status: "BAD_REQUEST" });
    expect(String(fetch.mock.calls[0][0])).toBe("https://api.pwnedpasswords.com/range/5BAA6");
  });

  it("accepts a password that isn't listed", async () => {
    vi.stubGlobal("fetch", answer(CLEAN_RANGE));
    await expect(signUp(makeAuth().auth, "b@example.test")).resolves.toMatchObject({ user: { email: "b@example.test" } });
  });

  it("fails closed with a 503 within the bound, aborts the lookup and logs it", async () => {
    const { fn, signals } = hang();
    vi.stubGlobal("fetch", fn);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const t0 = Date.now();
    await expect(signUp(makeAuth(100).auth, "c@example.test")).rejects.toMatchObject({ status: "SERVICE_UNAVAILABLE", statusCode: 503 });
    expect(Date.now() - t0).toBeLessThan(1500);
    expect(signals[0].aborted).toBe(true);
    expect(log.mock.calls.flat().join(" ")).toMatch(/pwnedpasswords/);
  });

  it("fails closed when the service answers with an error status", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 503 })));
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(signUp(makeAuth().auth, "d@example.test")).rejects.toMatchObject({ status: "SERVICE_UNAVAILABLE" });
  });

  it("skips non-string passwords and leaves them to the endpoint's validation", async () => {
    const fetch = answer(CLEAN_RANGE);
    vi.stubGlobal("fetch", fetch);
    // Body validation errors carry a numeric status (400), unlike APIError's "BAD_REQUEST".
    await expect(signUp(makeAuth().auth, "e@example.test", 12345678)).rejects.toMatchObject({ status: 400 });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("doesn't check on sign-in", async () => {
    const fetch = answer(CLEAN_RANGE);
    vi.stubGlobal("fetch", fetch);
    const { auth } = makeAuth();
    await signUp(auth, "f@example.test");
    fetch.mockClear();
    await auth.api.signInEmail({ body: { email: "f@example.test", password: SAFE } });
    expect(fetch).not.toHaveBeenCalled();
  });

  // better-auth 1.7.7 consumes the reset token before hashing (better-auth#10632); checking first keeps it usable.
  it("keeps the reset link usable after a refused password or a lookup outage", async () => {
    vi.stubGlobal("fetch", answer(CLEAN_RANGE));
    const { auth, resetToken } = makeAuth(100);
    await signUp(auth, "g@example.test");
    await auth.api.requestPasswordReset({ body: { email: "g@example.test", redirectTo: "/" } });
    const token = resetToken();
    expect(token).not.toBe("");

    vi.stubGlobal("fetch", answer(BREACHED_RANGE));
    await expect(auth.api.resetPassword({ body: { token, newPassword: BREACHED } })).rejects.toMatchObject({ status: "BAD_REQUEST" });

    vi.stubGlobal("fetch", hang().fn);
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(auth.api.resetPassword({ body: { token, newPassword: "another-unlisted-password-42" } })).rejects.toMatchObject({
      status: "SERVICE_UNAVAILABLE",
    });

    vi.stubGlobal("fetch", answer(CLEAN_RANGE));
    await expect(auth.api.resetPassword({ body: { token, newPassword: "another-unlisted-password-42" } })).resolves.toMatchObject({ status: true });
  });
});
```

- [ ] **Step 2: Run to see it fail.** `cd web && env -u NODE_ENV pnpm vitest run tests/pwned.test.ts`.
  Expected: FAIL at import (`breachCount`/`passwordFrom`/`pwnedPasswordCheck` not exported).

- [ ] **Step 3: Implement.** Replace `web/src/lib/pwned.ts` with:

```ts
import { createHash } from "node:crypto";
import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";

// Endpoints that set a password, and the body field each reads (better-auth 1.7.7 routes).
const PASSWORD_FIELDS: Record<string, "password" | "newPassword"> = {
  "/sign-up/email": "password",
  "/admin/create-user": "password",
  "/change-password": "newPassword",
  "/reset-password": "newPassword",
  "/admin/set-user-password": "newPassword",
};

// The password a request sets, or null (another path, or a missing/non-string value the endpoint will reject).
export function passwordFrom(path: string | undefined, body: unknown): string | null {
  const field = path && Object.hasOwn(PASSWORD_FIELDS, path) ? PASSWORD_FIELDS[path] : null;
  const value = field && body && typeof body === "object" ? (body as Record<string, unknown>)[field] : null;
  return typeof value === "string" && value ? value : null;
}

// Times the range response lists this hash suffix; padding entries (Add-Padding) and absent suffixes count 0.
export function breachCount(body: string, suffix: string): number {
  for (const line of body.split(/\r?\n/)) {
    const [hashSuffix, count] = line.split(":");
    if (hashSuffix.toUpperCase() !== suffix) continue;
    const n = Number(count);
    if (!Number.isSafeInteger(n) || n < 0) throw new Error(`malformed count "${count}"`);
    return n;
  }
  return 0;
}

async function isBreached(password: string, timeoutMs: number): Promise<boolean> {
  const hash = createHash("sha1").update(password).digest("hex").toUpperCase();
  try {
    // k-anonymity: only the first 5 hex characters of the hash leave the server.
    const res = await fetch(`https://api.pwnedpasswords.com/range/${hash.slice(0, 5)}`, {
      headers: { "Add-Padding": "true", "User-Agent": "matherlynet" },
      // Covers the body too, and cancels the request instead of leaving it running.
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return breachCount(await res.text(), hash.slice(5)) > 0;
  } catch (error) {
    // Logged with the cause (timeout, HTTP status): onAPIError in auth.ts logs and reports only the 503 itself.
    console.error(`pwned: api.pwnedpasswords.com lookup failed (${error instanceof Error ? error.message : String(error)}); password refused`);
    throw new APIError("SERVICE_UNAVAILABLE", { message: "Couldn't check the password right now. Please try again." });
  }
}

// Have I Been Pwned, checked before the endpoint runs. Replaces better-auth's haveIBeenPwned plugin (1.7.7), which
// checks inside password.hash: /reset-password has consumed the token by then, so a refused password burned the
// reset link (better-auth#10632, fix pending in #10717), and its lookup had no timeout or abort (#11051).
// Fails closed: if the lookup fails or takes longer than timeoutMs, the password is refused with a 503.
export function pwnedPasswordCheck(timeoutMs = 5_000): BetterAuthPlugin {
  return {
    id: "pwned-password-check",
    hooks: {
      before: [
        {
          matcher: (ctx) => passwordFrom(ctx.path, ctx.body) !== null,
          handler: createAuthMiddleware(async (ctx) => {
            const password = passwordFrom(ctx.path, ctx.body);
            if (password && (await isBreached(password, timeoutMs))) {
              throw new APIError("BAD_REQUEST", {
                message: "The password you entered has been compromised. Please choose a different password.",
                code: "PASSWORD_COMPROMISED",
              });
            }
          }),
        },
      ],
    },
  };
}
```

  If `astro check` rejects `ctx.path`/`ctx.body` types in the matcher, read `HookEndpointContext` in
  `@better-auth/core/dist/types/plugin.d.mts` and adapt the parameter types; don't cast to `any`.

- [ ] **Step 4: Wire it in.** In `web/src/lib/auth.ts`: replace `import { boundedPwned } from "./pwned";` with
  `import { pwnedPasswordCheck } from "./pwned";` and `plugins: [admin(), boundedPwned()]` with
  `plugins: [admin(), pwnedPasswordCheck()]`. Replace the two-line comment above `hooks` with:

```ts
  // APIErrors thrown inside an endpoint become responses before onAPIError (api/dispatch.mjs), e.g. a 500 from a
  // failed session insert: this hook reports those. One thrown by a before hook (the breached-password lookup's 503)
  // skips this hook and reaches onAPIError instead (checked against 1.7.7 through auth.handler).
```

  Delete `web/tests/pwned-real.test.ts`.

- [ ] **Step 5: Update the existing 5xx-reporting test.** `web/tests/admin-promotion.test.ts`, test "a 5xx APIError
  inside an endpoint (Have I Been Pwned answers 500) is reported to Sentry": the lookup failure is now a 503 thrown
  by the before hook, reported by `onAPIError` (no `path` extra). Rename it to "a failed breached-password lookup
  (Have I Been Pwned answers 500) is reported to Sentry" and replace its last two lines with:

```ts
    expect(res.status).toBe(503);
    expect(capture).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 503 }));
```

  That test no longer reaches the after hook, so give the after hook its own test. `/verify-email` (with
  `autoSignInAfterVerification`, on in `auth.ts`) throws `APIError("INTERNAL_SERVER_ERROR",
  FAILED_TO_CREATE_SESSION)` inside the endpoint when the session insert returns nothing
  (`better-auth/dist/api/routes/email-verification.mjs:301`). In the same file, add a flag to the hoisted state:

```ts
  dbDown: false,
  sessionInsertFails: false,
}));
```

  in the mocked `drizzleAdapter`, make `create` honor it (the returned object gains a `create` before `findOne`):

```ts
      return {
        ...a,
        // h.sessionInsertFails makes session inserts come back empty, which better-auth turns into a 500 inside the
        // endpoint (the after hook's path, unlike a thrown adapter error, which escapes to onAPIError).
        create: (...args: Parameters<typeof a.create>) =>
          h.sessionInsertFails && args[0].model === "session" ? Promise.resolve(null as never) : a.create(...args),
        findOne: (...args: Parameters<typeof a.findOne>) =>
          h.dbDown ? Promise.reject(new Error("connect ECONNREFUSED")) : a.findOne(...args),
      };
```

  and add this test after the renamed one:

```ts
  it("a 5xx APIError thrown inside an endpoint (failed session insert) is reported with its path", async () => {
    const capture = await captureError();
    capture.mockClear();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 200 })));
    await auth.api.signUpEmail({ body: { email: "f5@example.test", password: PASSWORD, name: "T" } as never });
    h.sessionInsertFails = true;
    const res = await auth.handler(new Request(link("f5@example.test")));
    h.sessionInsertFails = false;
    expect(res.status).toBe(500);
    // Only the after hook passes { path }: this pins that path, not onAPIError's.
    expect(capture).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 500 }), { path: "/verify-email" });
  });
```

  (Spike 2026-10-01: status 500, captured `[500, { path: "/verify-email" }]`. The `fetch` re-stub matters: the
  previous test leaves `fetch` answering 500.)

- [ ] **Step 6: Run the tests.** `cd web && env -u NODE_ENV pnpm vitest run` (all files). Expected: PASS (dry run
  on 2026-10-01: 84/84 with Steps 1–5 applied, before the after-hook test was added). Then
  `env -u NODE_ENV pnpm check && env -u NODE_ENV pnpm lint`. Expected: 0 errors.

- [ ] **Step 7: Docs.** In `.claude/rules/web-architecture.md` replace the two `src/lib/pwned.ts` lines with:

```text
  src/lib/pwned.ts     pwnedPasswordCheck(): Have I Been Pwned in a before hook (ahead of the reset-token
                       consume), fetch aborted after 5 s; fails closed with a 503, logged
```

- [ ] **Step 8: End to end.** With the stack running (`env -u NODE_ENV aspire start`, then
  `aspire resource web restart`), run `cd web && env -u NODE_ENV pnpm e2e`. Expected: all pass (sign-up and reset
  call the real api.pwnedpasswords.com).

- [ ] **Step 9: Commit.**

```bash
git add web/src/lib/pwned.ts web/src/lib/auth.ts web/tests/pwned.test.ts web/tests/pwned-real.test.ts web/tests/admin-promotion.test.ts .claude/rules/web-architecture.md
git commit -m "Auth: check breached passwords before the endpoint, abort a slow lookup

better-auth 1.7.7's haveIBeenPwned checks inside password.hash, after
/reset-password has consumed the token: a refused password (or our 503 on a
lookup timeout) burned the reset link (better-auth#10632; fix #10717 open).
Its fetch has no timeout or signal (#11051 open), so our Promise.race left
timed-out lookups running.

The check is now a plugin before hook (runs ahead of the handler with the raw
body; hooks.before type in @better-auth/core plugin.d.mts) with
AbortSignal.timeout. Same paths and fail-closed behavior as before. A
failed lookup is now a 503 (was 500 for an HTTP error) and reaches Sentry
through onAPIError, not the after hook.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Refuse Sentry DSN names that resolve to private addresses (F3)

**Files:**

- Modify: `web/src/lib/settings-form.ts` (`isPrivateIPv4`, new exported `isPrivateAddress`, `isPrivateHost`, comment)
- Modify: `web/src/lib/sentry.ts` (new exported `publicOnlyLookup`, transport factory)
- Test: `web/tests/settings-form.test.ts`, `web/tests/sentry-transport.test.ts`, `web/tests/sentry-wiring.test.ts`
- Docs: `.claude/rules/web-architecture.md` (the `sentry.ts` lines)

**Interfaces:**

- Produces: `isPrivateAddress(ip: string): boolean` (a bare IPv4/IPv6 address, no brackets);
  `publicOnlyLookup(lookup?: typeof dns.lookup): LookupFunction`.
- Consumes: nothing from Task 1.

How it works: `@sentry/node` `makeNodeTransport` accepts `httpModule` (`build/types/transports/http.d.ts`) and
calls `httpModule.request({ method, agent, headers, hostname, path, port, protocol, ca }, cb)`
(`build/cjs/transports/http.js`, `createRequestExecutor`). Node's `http(s).request` passes a `lookup` option to the
socket, which calls it on every new connection; IP-literal hosts skip it (so `/admin`'s literal check stays).
With `http(s)_proxy` set, Sentry passes its own `HttpsProxyAgent` (`build/cjs/proxy/index.js`), which sends
`CONNECT <dsn host>` and lets the proxy resolve the name; the wrapper's own agents keep connections direct.
Also adds 100.64.0.0/10 (shared address space, e.g. Tailscale) to the private IPv4 ranges, and IPv6 forms that
carry an IPv4 address (Node's `net.BlockList` matches IPv4-mapped forms but not NAT64, 6to4 or IPv4-compatible
ones, checked 2026-10-01, so the check expands the address into its eight groups instead).

- [ ] **Step 1: Write the failing tests.**

  `web/tests/settings-form.test.ts`: change the import to
  `import { isPrivateAddress, parseSettingsForm } from "../src/lib/settings-form";` and append:

```ts
describe("isPrivateAddress", () => {
  it("flags private, loopback, link-local and shared addresses", () => {
    for (const ip of [
      "0.0.0.0", "10.0.0.5", "127.0.0.1", "169.254.169.254", "172.16.0.1", "192.168.1.1", "100.64.0.1", "100.127.255.254",
      "::", "::1", "fd00::1", "fe80::1", "fec0::1",
    ]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
  });
  it("flags IPv6 forms that carry or tunnel to a private IPv4 address", () => {
    for (const ip of [
      "::ffff:10.0.0.5", "::ffff:a00:5", "0:0:0:0:0:ffff:a00:5", // IPv4-mapped, any text form
      "::a00:5", "::10.0.0.5", // IPv4-compatible (deprecated)
      "64:ff9b::a00:5", "64:ff9b::10.0.0.5", "64:ff9b:1::a00:5", // NAT64 well-known and local-use prefixes
      "2002:a00:5::1", // 6to4
      "2001:0:4136:e378::1", // Teredo
    ]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
  });
  it("passes public addresses, including NAT64 and 6to4 forms of public IPv4", () => {
    for (const ip of [
      "104.16.0.1", "100.63.255.255", "100.128.0.1", "172.32.0.1", "2606:4700::1111", "2001:db8::1",
      "2a00:1450:4001::200e", "::ffff:104.16.0.1", "::ffff:6810:1", "64:ff9b::6810:1", "2002:6810:1::1",
    ]) {
      expect(isPrivateAddress(ip), ip).toBe(false);
    }
  });
});
```

  and in the second `it.each(…)("rejects %s")` table, add `"100.64.0.1"` to the IPv4 host list
  (`["10.0.0.5", "127.0.0.1", …, "2130706433"]`) and `"[64:ff9b::10.0.0.5]"`, `"[2002:a00:5::1]"` to the bracketed
  IPv6 list (`["[::1]", …, "[fe80::1]"]`), so `/admin` rejects those DSNs (the URL parser hands them over as
  `[64:ff9b::a00:5]` and `[2002:a00:5::1]`, checked 2026-10-01).

  `web/tests/sentry-transport.test.ts`: change the imports to

```ts
import type dns from "node:dns";
import type { LookupAddress } from "node:dns";
import https from "node:https";
import { describe, expect, it, vi } from "vitest";
import { gateTransport, publicOnlyLookup } from "../src/lib/sentry";
```

  and append:

```ts
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

  it("passes resolver errors through", () => {
    const failing = ((_h: string, _o: unknown, callback: (err: Error) => void) =>
      callback(Object.assign(new Error("nope"), { code: "ENOTFOUND" }))) as unknown as typeof dns.lookup;
    const cb = vi.fn();
    publicOnlyLookup(failing)("sentry.example.test", {}, cb);
    expect(cb.mock.calls[0][0]).toMatchObject({ code: "ENOTFOUND" });
  });
});
```

  `web/tests/sentry-wiring.test.ts`: add `vi` to the vitest import and append:

```ts
it("sends nothing to a DSN whose name resolves to a private address", async () => {
  const c = await sink();
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  // localhost resolves to ::1 / 127.0.0.1 (the sink listens on 127.0.0.1); IP literals skip the lookup.
  configureSentry(c.dsn.replace("127.0.0.1", "localhost"));
  Sentry.captureException(new Error("private"));
  await Sentry.flush(2000);
  expect(c.envelopes).toHaveLength(0);
  expect(log.mock.calls.flat().join(" ")).toMatch(/private address/);
  log.mockRestore();
});

it("connects directly even when a proxy is configured, so the lookup check always applies", async () => {
  const d = await sink();
  // Nothing listens on port 9: through Sentry's proxy agent this event would be lost.
  vi.stubEnv("http_proxy", "http://127.0.0.1:9");
  configureSentry(d.dsn);
  Sentry.captureException(new Error("direct"));
  await Sentry.flush(2000);
  vi.unstubAllEnvs();
  expect(d.events()).toBe(1);
});
```

- [ ] **Step 2: Run to see them fail.** `cd web && env -u NODE_ENV pnpm vitest run tests/settings-form.test.ts
  tests/sentry-transport.test.ts tests/sentry-wiring.test.ts`. Expected: FAIL — `isPrivateAddress` and
  `publicOnlyLookup` not exported; the private-DSN wiring test receives 1 envelope and the proxy test 0 events
  (confirm both: they prove each test fails without its fix; if not, find out why before continuing).

- [ ] **Step 3: Implement `isPrivateAddress`.** In `web/src/lib/settings-form.ts` replace `isPrivateIPv4`, the
  comment block above `isPrivateHost`, and `isPrivateHost` with:

```ts
// 0/8, 10/8, 127/8, 169.254/16, 172.16/12, 192.168/16 and 100.64/10 (shared address space, e.g. Tailscale).
const isPrivateIPv4 = ([a, b]: number[]) =>
  a === 0 ||
  a === 10 ||
  a === 127 ||
  (a === 100 && b >= 64 && b <= 127) ||
  (a === 169 && b === 254) ||
  (a === 172 && b >= 16 && b <= 31) ||
  (a === 192 && b === 168);

// The eight 16-bit groups of an IPv6 address in any text form (`::` compression, dotted IPv4 tail), or null.
function ipv6Groups(ip: string): number[] | null {
  const dotted = /(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(ip);
  if (dotted) {
    const [a, b, c, d] = dotted.slice(1).map(Number);
    ip = `${ip.slice(0, dotted.index)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const halves = ip.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves[1] ? halves[1].split(":") : [];
  const zeros = halves.length === 2 ? 8 - head.length - tail.length : 0;
  const groups = [...head, ...Array<string>(Math.max(zeros, 0)).fill("0"), ...tail];
  return groups.length === 8 && groups.every((g) => /^[0-9a-f]{1,4}$/i.test(g)) ? groups.map((g) => parseInt(g, 16)) : null;
}

// A bare IP address (no brackets) in a private, loopback, link-local or shared range, including IPv6 forms that
// carry an IPv4 address (mapped, NAT64, 6to4) or tunnel to one (Teredo). Also used at connect time by server
// Sentry's DNS lookup (sentry.ts), so a DSN name that resolves into the local network is refused there.
export function isPrivateAddress(ip: string): boolean {
  if (!ip.includes(":")) {
    const parts = ip.split(".").map(Number);
    return parts.length === 4 && parts.every(Number.isInteger) && isPrivateIPv4(parts);
  }
  const g = ipv6Groups(ip);
  if (!g) return false;
  const v4 = (hi: number, lo: number) => [hi >> 8, hi & 255, lo >> 8, lo & 255];
  const zeros = (from: number, to: number) => g.slice(from, to).every((x) => x === 0);
  if (zeros(0, 6)) return true; // ::, ::1 and the deprecated IPv4-compatible ::a.b.c.d
  if (zeros(0, 5) && g[5] === 0xffff) return isPrivateIPv4(v4(g[6], g[7])); // IPv4-mapped ::ffff:a.b.c.d
  // NAT64: 64:ff9b::/96 embeds the IPv4 address (public ones are how IPv6-only hosts reach Sentry); 64:ff9b:1::/48
  // is local-use by definition.
  if (g[0] === 0x64 && g[1] === 0xff9b) return g[2] === 1 || isPrivateIPv4(v4(g[6], g[7]));
  if (g[0] === 0x2002) return isPrivateIPv4(v4(g[1], g[2])); // 6to4 (deprecated): 2002:AABB:CCDD::/48
  if (g[0] === 0x2001 && g[1] === 0) return true; // Teredo: the IPv4 address is obfuscated; never a Sentry host
  return (g[0] & 0xfe00) === 0xfc00 || (g[0] & 0xffc0) === 0xfe80 || (g[0] & 0xffc0) === 0xfec0; // ULA, link-, site-local
}

// The server sends events to the DSN, so it must not point into the local network (SSRF). Literal addresses are
// refused here; a DNS name is checked when server Sentry connects (publicOnlyLookup in sentry.ts).
// `hostname` is the URL-normalized form: numeric (2130706433) and IPv4-mapped IPv6 hosts arrive canonical.
function isPrivateHost(hostname: string): boolean {
  // `localhost.` (a fully qualified name) and `*.localhost` (RFC 6761) resolve to loopback too.
  const name = hostname.replace(/\.$/, "");
  if (name === "localhost" || name.endsWith(".localhost")) return true;
  return isPrivateAddress(hostname.startsWith("[") ? hostname.slice(1, -1) : hostname);
}
```

- [ ] **Step 4: Implement the lookup and wire it.** In `web/src/lib/sentry.ts` add imports at the top:

```ts
import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import type { LookupFunction } from "node:net";
import { isPrivateAddress } from "./settings-form";
```

  add after `gateTransport`:

```ts
// /admin refuses private IP literals in the DSN; a DNS name is checked here, on every new connection, against every
// address it resolves to, so a name that points into the local network (now or after a DNS change) is refused (SSRF).
export const publicOnlyLookup =
  (lookup: typeof dns.lookup = dns.lookup): LookupFunction =>
  (hostname, options, callback) =>
    lookup(hostname, { ...options, all: true as const }, (err, addresses) => {
      if (err) return callback(err, "");
      const blocked = addresses.find((a) => isPrivateAddress(a.address));
      if (blocked) {
        console.error(`sentry: ${hostname} resolves to private address ${blocked.address}; event not sent`);
        return callback(Object.assign(new Error(`${hostname} resolves to a private address`), { code: "EPRIVATEADDR" }), "");
      }
      if (options.all) return callback(null, addresses);
      callback(null, addresses[0].address, addresses[0].family);
    });

// Sentry's Node transport with publicOnlyLookup on every request (its httpModule option). Our own agents (Sentry's
// defaults: keep-alive, 30 sockets, 2 s idle timeout) replace the one it passes, which is a CONNECT proxy agent when
// http(s)_proxy is set: the proxy would resolve the DSN name itself and the lookup would never run. So server Sentry
// always connects directly.
const lookup = publicOnlyLookup();
const agents = {
  http: new http.Agent({ keepAlive: true, maxSockets: 30, timeout: 2_000 }),
  https: new https.Agent({ keepAlive: true, maxSockets: 30, timeout: 2_000 }),
};
const publicOnlyHttp = {
  request: (options: http.RequestOptions, callback?: (res: http.IncomingMessage) => void) =>
    options.protocol === "http:"
      ? http.request({ ...options, agent: agents.http, lookup }, callback)
      : https.request({ ...options, agent: agents.https, lookup }, callback),
};
```

  and in `configureSentry` replace `makeMultiplexedTransport(Sentry.makeNodeTransport, …)` with
  `makeMultiplexedTransport((o) => Sentry.makeNodeTransport({ ...o, httpModule: publicOnlyHttp }), …)` (keep the
  second argument as it is). Type-check failures here are about the `httpModule` / `lookup` callback types: read
  `@sentry/node/build/types/transports/http-module.d.ts` and `@types/node` `net.d.ts` (`LookupFunction`) and match
  them; don't cast to `any`.

- [ ] **Step 5: Run the tests.** `cd web && env -u NODE_ENV pnpm vitest run && env -u NODE_ENV pnpm check &&
  env -u NODE_ENV pnpm lint`. Expected: all pass, 0 errors. (Dry run 2026-10-01, Tasks 1+2 applied: 90/90 tests,
  0 type errors, lint clean; the wiring test failed with "got 1" envelope without the guard. Follow-up spikes: the
  proxy test passes with the agents and fails, "expected +0 to be 1", without them; `isPrivateAddress` as above
  classified 34/34 addresses correctly.)

- [ ] **Step 6: Empirical check against real DNS.** With the stack running and server reporting on in `/admin`,
  set the DSN to `https://k@localtest.me/1` (a public name that resolves to 127.0.0.1). Expected: the form saves
  (it's a name, not a literal); trigger a server error (e.g. `aspire resource pg stop`, load `/account`, then
  `aspire resource pg start`); `aspire logs web` shows `sentry: localtest.me resolves to private address
  127.0.0.1; event not sent`. Restore the real DSN afterwards (memory `deploy-config.md` has it).

- [ ] **Step 7: Docs.** In `.claude/rules/web-architecture.md`, extend the `src/lib/sentry.ts` entry with
  `; connects only to public addresses (publicOnlyLookup)` and the `settings-form.ts` entry with
  `; isPrivateAddress()`. Keep lines within 120 columns.

- [ ] **Step 8: Commit.**

```bash
git add web/src/lib/settings-form.ts web/src/lib/sentry.ts web/tests/settings-form.test.ts web/tests/sentry-transport.test.ts web/tests/sentry-wiring.test.ts .claude/rules/web-architecture.md
git commit -m "Sentry: refuse DSN names that resolve to private addresses

/admin refused private IP literals only. Server Sentry now connects through a
lookup that checks every resolved address (makeNodeTransport's httpModule
option, @sentry/node build/types/transports/http.d.ts; Node's request
lookup option runs per connection, so later DNS changes are covered too).
IP literals skip the lookup and stay covered by the form check.

The transport uses its own agents: with http(s)_proxy set, Sentry's
HttpsProxyAgent (build/cjs/proxy/index.js) has the proxy resolve the name,
which would skip the check. Adds 100.64.0.0/10, and IPv6 forms that carry
an IPv4 address (mapped, IPv4-compatible, NAT64, 6to4) or tunnel (Teredo).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Compose healthcheck through a committed override (F4)

**Files:**

- Create: `deploy/docker-compose.override.yaml`
- Modify: `apphost.mts` (imports; a publish pipeline step that copies the override into the output directory)
- Modify: `docs/deployment.md` (section 2), `.claude/rules/apphost.md` (the `Service` bullet), `AGENTS.md`
  (architecture tree)

**Interfaces:** none (deployment only).

Why an override: the published `docker-compose.yaml` is generated (never edited), and Aspire 13.6.0's TS SDK can't
add a `healthcheck` (see F4). Compose merges `docker-compose.override.yaml` from the same directory automatically
(verified with `docker compose config`). `/api/auth/ok` stays 200 while Postgres is down (better-auth's rate limiter
skips it), the same endpoint the K8s probes use, so a database outage doesn't mark web unhealthy. `start_period`
covers `migrate.mjs`'s 60 s wait for Postgres.

Why the AppHost copies it: a manual `cp` after every publish is easy to forget. `builder.pipeline().addStep` exists
in the TS SDK; `PipelineStepContext` has no output path, but Aspire binds `PipelineOptions` to the `Pipeline`
configuration section (`DistributedApplicationBuilder.cs`), so `-o` is `Pipeline:OutputPath`, and without `-o`
the directory is `<AppHost:Directory>/aspire-output` (`PipelineOutputService.cs`). Spiked 2026-10-01: the step
copied the file with `-o <absolute>`, `-o out/<relative>` and no `-o`; `DEPLOY_TARGET=k8s aspire publish` doesn't
register it; `aspire do push --list-steps` (CI) doesn't include it; AppHost `tsc` and `eslint` clean.

- [ ] **Step 1: Create `deploy/docker-compose.override.yaml`:**

```yaml
# Merged into the published docker-compose.yaml by Docker Compose (same directory, default name). Aspire 13.6's
# TypeScript SDK can't set a Compose healthcheck (its Healthcheck type isn't exported), so it lives here;
# `aspire publish` copies it into the output directory (apphost.mts, copy-compose-override step).
services:
  web:
    healthcheck:
      # BusyBox wget ships in the node:24-alpine runtime image. /api/auth/ok answers without the database.
      test: ["CMD", "wget", "-q", "-O", "/dev/null", "http://127.0.0.1:4321/api/auth/ok"]
      interval: 30s
      timeout: 3s
      retries: 3
      # migrate.mjs waits up to 60 s for Postgres before the server starts. (No start_interval: it needs a newer
      # Compose/Engine than the production host is known to have, and nothing waits on web being healthy.)
      start_period: 90s
```

- [ ] **Step 2: Copy it at publish.** In `apphost.mts`, add above the `.aspire/modules` import:

```ts
import { copyFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
```

  and replace the final `await builder.build().run();` with:

```ts
// Compose: Aspire 13.6's TS SDK can't set a healthcheck (.claude/rules/apphost.md), so web's lives in
// deploy/docker-compose.override.yaml. Publishing copies it next to docker-compose.yaml, where Compose merges it.
// The output directory is Aspire's Pipeline:OutputPath (`-o`), else <AppHost dir>/aspire-output.
if (!k8s) {
  await builder.pipeline().addStep('copy-compose-override', async () => {
    const output = await config.getConfigValue('Pipeline:OutputPath');
    const dir = output ? resolve(output) : join((await config.getConfigValue('AppHost:Directory')) ?? '.', 'aspire-output');
    await copyFile(new URL('./deploy/docker-compose.override.yaml', import.meta.url), join(dir, 'docker-compose.override.yaml'));
  }, { dependsOn: ['publish-compose'], requiredBy: ['publish'] });
}

await builder.build().run();
```

  Then `env -u NODE_ENV npx tsc -p tsconfig.apphost.json --noEmit && env -u NODE_ENV npm run lint`. Expected: clean.

- [ ] **Step 3: Validate the publish and the merge.**
  `rm -rf out/compose && env -u NODE_ENV aspire publish -o out/compose --non-interactive --nologo`. Expected: the
  step summary lists `copy-compose-override` ✓, and `ls out/compose` shows `docker-compose.override.yaml` next to
  `docker-compose.yaml`. Then `cd out/compose && WEB_IMAGE=x PG_PASSWORD=x docker compose config | grep -A12
  healthcheck`. Expected: the `web` service shows the healthcheck with `start_period: 1m30s`. Also run
  `DEPLOY_TARGET=k8s env -u NODE_ENV aspire publish -o out/k8s --non-interactive --nologo` (expected: succeeds,
  no `copy-compose-override` step) and `env -u NODE_ENV aspire do push --list-steps --non-interactive --nologo`
  (expected: no `copy-compose-override`).

- [ ] **Step 4: Validate it runs (OrbStack).** In `out/compose`, write a throwaway `.env.test` (not committed;
  `out/` is gitignored) and start the CI-built image:

```bash
cd out/compose
cat > .env.test <<EOF
WEB_IMAGE=ghcr.io/jrmatherly/matherlynet/web:d2516567a3bce65c37dbe962eb578e66aaf36144
APP_URL=http://localhost:4321
BETTER_AUTH_SECRET=$(openssl rand -hex 32)
PG_PASSWORD=$(openssl rand -hex 16)
ADMIN_EMAIL=
MAIL_FROM=test@example.test
SMTP_URL=smtp://localhost:1025
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
EOF
# Only web (and pg, its dependency): the published file also has an Aspire dashboard service.
docker compose -p hc-test --env-file .env.test up -d web
for i in $(seq 1 30); do
  s=$(docker inspect --format '{{.State.Health.Status}}' hc-test-web-1); echo "$s"
  [ "$s" = healthy ] && break; sleep 5
done
docker compose -p hc-test ps web   # STATUS: Up … (healthy)
docker compose -p hc-test down -v; rm .env.test
```

  Expected: `healthy` after the first check (about 30 s; the image is amd64-only, so on Apple Silicon it runs under
  emulation and may take longer). If it ends `unhealthy`, run
  `docker inspect --format '{{json .State.Health}}' hc-test-web-1` and fix before continuing.

- [ ] **Step 5: Runbook.** In `docs/deployment.md` section 2, replace the code block and the paragraph after it
  (from `cd out/compose` through "readiness is checked by hand as above.") with:

````markdown
```sh
cd out/compose           # aspire publish also wrote docker-compose.override.yaml (the web healthcheck)
docker compose --env-file .env up -d
docker compose ps        # web: Up … (healthy) once migrations ran and the server answers
```

`migrate.mjs` waits up to 60 s for Postgres; `restart: unless-stopped` retries if it gives up. Aspire 13.6's
TypeScript SDK can't express a Compose `healthcheck`, so it lives in `deploy/docker-compose.override.yaml`, which
`aspire publish` copies into the output directory and Compose merges automatically. Copy the whole output directory
to the server, override included. The healthcheck probes `/api/auth/ok`, which stays up while Postgres is down, so
a database outage doesn't mark web unhealthy.
````

- [ ] **Step 6: Rules.** In `.claude/rules/apphost.md` replace the bullet starting "The TS `Service` type for
  Compose has no `healthcheck` member." with:

```markdown
  - The TS `Service` type for Compose has no `healthcheck` member (upstream `Healthcheck` lacks `[AspireExport]`):
    web's healthcheck is `deploy/docker-compose.override.yaml`, which the `copy-compose-override` pipeline step
    copies into the publish output (`Pipeline:OutputPath`; `PipelineStepContext` has no output path). The published
    dashboard is configured through `configureDashboard` → `publishAsDockerComposeService` (UI port on loopback).
```

  In `AGENTS.md`'s architecture tree add after the `docs/deployment.md` line:

```text
deploy/                docker-compose.override.yaml: web healthcheck; `aspire publish` copies it into out/compose
```

  Confirm `wc -l AGENTS.md` stays under 200 and `markdownlint-cli2 docs/deployment.md AGENTS.md .claude/rules/apphost.md`
  passes.

- [ ] **Step 7: Commit.**

```bash
git add deploy/docker-compose.override.yaml apphost.mts docs/deployment.md .claude/rules/apphost.md AGENTS.md
git commit -m "Compose: web healthcheck through an override the publish copies

Aspire 13.6.0's TypeScript SDK can't set a Compose healthcheck: upstream's
Healthcheck class has no [AspireExport] (src/Aspire.Hosting.Docker), and
DockerfileStage has no HEALTHCHECK. Compose merges
docker-compose.override.yaml from the published directory; a pipeline step
copies it there (output path from the Pipeline:OutputPath configuration that
PipelineOptions binds). Verified with docker compose config and a local run
of the CI image (healthy).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Verify the branch and open the PR

- [ ] **Step 1:** Run `/verify`. Expected: every step PASS (a NOTE about a stale-Vite-deps retry is expected after
  dependency changes; there are none in this plan).
- [ ] **Step 2:** Whole-branch review (`superpowers:requesting-code-review` or `/code-review`) against `main`; fix
  findings in follow-up commits.
- [ ] **Step 3:** Ask the user for approval to push. Then `git push -u origin hardening-follow-ups` and open the PR
  with `.github/pull_request_template.md`. The body lists F1–F6 with their outcome, the verification evidence
  (test names, `/verify` result, the healthy `docker compose ps` line, the `localtest.me` log line), deployment
  impact ("`aspire publish` now also writes `docker-compose.override.yaml`; ship it with the rest of the output";
  "server Sentry ignores `http(s)_proxy`"), and "Known follow-ups":
  revisit Task 1 when better-auth ships #10717/#11051 (our plugin can stay either way); the healthcheck override can
  go once Aspire exports `Healthcheck`.
- [ ] **Step 4:** Watch CI (`/ship` covers it after merge). Merge only on the user's say-so.

---

## After merge (not in this PR)

- **Deploy** (`docs/deployment.md`): publish with `IMAGE_TAG=<merge sha>` (writes the override too), fill `.env`
  (memory `deploy-config.md`), cloudflared on the compose network, Cloudflare `www` redirect + header and `.map`
  rules, forwarded-protocol check. Needs the user's go-ahead; the Cloudflare MCP can create the rules if approved.
- **Upstream Aspire request** (ask first, it's public): add `[AspireExport]` to
  `src/Aspire.Hosting.Docker/Resources/ServiceNodes/Healthcheck.cs` so TS AppHosts can set `service.healthcheck`.
- **Dotfiles agent-safe shell** (completed plan Task 24): in a `~/dev/dotfiles` session.

## Plan review (2026-10-01)

Tasks 1 and 2 were applied to the tree as written, run, and reverted. Changes from that review:

- Task 1 missed `admin-promotion.test.ts`'s HIBP-500 test (expects 500 and an after-hook capture with `path`); a
  before-hook 503 skips the after hook and reaches `onAPIError`. Added Step 5 and corrected the `auth.ts` comment
  and the `pwned.ts` log comment (`onAPIError` does log the 503).
- Body validation errors carry `status: 400` (number), not `"BAD_REQUEST"`: fixed the non-string test.
- The `answer` helper's unused `_url`/`_init` failed lint: typed through `vi.fn`'s generic instead.
- Confirmed: the hook reads the body for HTTP requests through `auth.handler`, not only `auth.api.*`.
- Task 3: dropped `start_interval` (Compose ≥ 2.20.2 per the compose-spec; production's Compose/Engine versions are
  unknown, and nothing waits on health); the local run starts only `web` + `pg` (the file also has an Aspire
  dashboard service) and polls health instead of a fixed sleep; noted the image is amd64-only.

Second round (2026-10-01), first left out, then researched and added:

- **After-hook test** (Task 1 Step 5): `/verify-email` throws an in-endpoint 500 when the session insert comes back
  empty (`email-verification.mjs:301`); a `sessionInsertFails` flag in the test's adapter mock triggers it. Spike:
  500, captured with `{ path: "/verify-email" }`, which only the after hook passes.
- **AppHost copies the override** (Task 3 Step 2): the output path is the `Pipeline:OutputPath` configuration value
  (Aspire binds `PipelineOptions` to the `Pipeline` section), readable with `config.getConfigValue`; spiked with
  absolute, relative and default output paths, K8s and `aspire do push` unaffected.
- **IPv6 embedded IPv4** (Task 2 Step 3): `isPrivateAddress` expands IPv6 into its eight groups and checks mapped,
  IPv4-compatible, NAT64 (64:ff9b::/96 decoded, so IPv6-only hosts still reach a public Sentry; 64:ff9b:1::/48
  refused), 6to4 and Teredo forms; `net.BlockList` doesn't decode NAT64/6to4/compatible forms. 34/34 cases correct.
- **Proxy bypass** (Task 2 Step 4): Sentry's `HttpsProxyAgent` has the proxy resolve the DSN host, skipping the
  lookup; the wrapper supplies its own agents, so server Sentry always connects directly. Trade-off: a host that can
  reach the internet only through a proxy can't send server errors (none does today). The wiring test fails
  without the agents (0 events) and passes with them.

## Self-review

- **Coverage:** F1, F2 → Task 1; F3 → Task 2; F4 → Task 3; F5, F6 → confirmed no change, recorded in the PR body;
  deploy, upstream request, dotfiles → "After merge". PR #2's three follow-ups all map to a task.
- **Placeholders:** none; every code step carries the code. The one edit described by location (Task 2 Step 1, the
  `100.64.0.1` host) names the exact table and list.
- **Names:** `pwnedPasswordCheck`, `breachCount`, `passwordFrom`, test flag `sessionInsertFails` (Task 1);
  `isPrivateAddress`, `ipv6Groups` (private), `publicOnlyLookup`, `agents`, `publicOnlyHttp` (Task 2);
  pipeline step `copy-compose-override` (Task 3) are used consistently in code, tests and docs. `EPRIVATEADDR`
  appears in the code and the test.
- **Review Focus:** each of the five lines has its test in Task 1 or Task 2.
