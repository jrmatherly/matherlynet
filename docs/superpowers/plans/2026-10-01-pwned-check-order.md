# Breached-Password Check Ordering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Have I Been Pwned lookup runs only for requests the endpoint would otherwise accept: not for signed-out
requests to session-gated routes, and not for passwords that break the length rules.

**Architecture:** Both fixes live in the one before hook in `web/src/lib/pwned.ts`, ahead of the lookup: first a
session check that mirrors the endpoints' own 401 gate (`getAuthoritativeSessionFromCtx`), then better-auth's length
rules with better-auth's own error codes. No other file changes behavior.

**Tech Stack:** better-auth 1.7.7 (`better-auth`, `better-auth/api`), Vitest with `memoryAdapter`.

**Spec:** the Findings section below (research done 2026-10-01 against the installed source; no separate spec).

## Findings

Deferred minors from PR #3, researched against `node_modules/better-auth/dist` (1.7.7), `@sentry/node`/`@sentry/core`
11.1.0, and live Sentry data.

| # | Item | Verdict | Evidence |
| :--- | :--- | :--- | :--- |
| 1 | Signed-out POSTs to session-gated password routes trigger the lookup | **Fix (Task 1)** | `/change-password` uses `sensitiveSessionMiddleware`, `/admin/set-user-password` `adminMiddleware`; both 401 via `getAuthoritativeSessionFromCtx` (`api/routes/session.mjs:304`, `plugins/admin/routes.mjs:17`). `/admin/create-user` 401s only when `ctx.request \|\| ctx.headers` (`routes.mjs:154`): server-side calls with neither are allowed and must stay checked. Prototype in a before hook via `auth.handler`: signed out → no session, endpoint 401; signed in → session, endpoint 200; server `createUser` → `request=false headers=false` |
| 2 | The 503's Sentry event has no request path | **No change: the note was wrong** | Sentry 11's Http.Server integration gives every request an isolation scope carrying `normalizedRequest` (`@sentry/core/build/esm/integrations/http/server-subscription.js:46-61`); `requestDataIntegration` adds `request.url` (query values filtered) to any event captured in it. Reproduced with a script: an in-request capture carried `url`, `method` and transaction `POST /api/auth/reset-password`. Live event from the image test (2026-10-01 16:29, OTel on) shows `url: http://imgtest.matherly.net/`, `transaction: GET /`. Only the request that first creates the client has no request data |
| 3 | A breached password that is also too short is reported as compromised | **Fix (Task 2)** | Length is enforced inside the endpoints (`utils/password.mjs`), after before hooks. `/admin/create-user` checks only the maximum (`routes.mjs:194`), so merely skipping short passwords would let an admin create a user with a short breached password that is refused today; the hook enforces both limits instead |

Dry run (2026-10-01): every code block in Tasks 1 and 2 was applied verbatim, then reverted. Red phases fail as
described below; green: 109/109 web tests, `astro check` 0 errors, eslint clean. Also checked:

- `Set-Cookie` on a signed-in `/change-password` is unchanged by the hook's extra session read (one
  `better-auth.session_token`, same as without the plugin). The cost is one more session query per signed-in request
  to a gated route (both reads bypass the cookie cache by design).
- Nothing in the app calls the gated routes (no change-password or admin-user UI); only `reset-password.astro` sets a
  password besides sign-up. Both forms have `minlength="8"`, so items 1 and 3 matter for direct API calls (anyone can
  POST to `/api/auth/*`), not for the UI's normal path.
- Order changes visible to API clients: a short password now gets `PASSWORD_TOO_SHORT` ahead of sign-up's
  `INVALID_EMAIL` and reset's missing-token `INVALID_TOKEN`. Harmless: both are 400s for a request that must change.

Dropped from tracking (decided 2026-10-01): pre-PR #3 DSNs (never deployed, nothing stored), `198.18/15` and
`192.0.0.0/24` (special-purpose, not private; no Sentry host lives there), `publicOnlyLookup` empty list
(getaddrinfo never returns one).

## Global Constraints

- Double quotes, semicolons, 2-space indent in `web/` TypeScript; ES modules.
- No new dependencies. `BASE_ERROR_CODES` and `APIError` come from `better-auth` (same `APIError` class as
  `better-auth/api`; checked), `getAuthoritativeSessionFromCtx` from `better-auth/api`.
- Run every `pnpm`/`node`/`aspire` command as `env -u NODE_ENV …` (the shell exports `NODE_ENV=production`).
- Before each `git commit`, empty `.claude/auto-memory/dirty-files-*` in a separate Bash call.
- Work on branch `fix/pwned-check-order`, never on `main`. Push and PR only with the user's approval.

## Review Focus

- A signed-in user changing to a breached password must still get `PASSWORD_COMPROMISED` (Task 1 test).
- Server-side `auth.api.createUser` (no headers) must still be checked (Task 1 test).
- During an HIBP outage a signed-out request to a gated route must get 401, not 503 (Task 1 test: fetch never
  called, so an outage can't reach it).
- A password exactly at the minimum must still be looked up (existing test: `"password"` is 8 characters, the
  default minimum of the test harness, which keeps better-auth's defaults).
- Every password route, `/admin/create-user` included, refuses passwords under 12 characters (user decision
  2026-10-01; Task 2 Steps 1 and 5 pin it).

---

### Task 1: Skip the lookup for signed-out requests to session-gated routes

**Files:**

- Modify: `web/src/lib/pwned.ts` (imports, new `SESSION_PATHS`, the before hook's handler, the comment above
  `pwnedPasswordCheck`)
- Test: `web/tests/pwned.test.ts`

**Interfaces:**

- Consumes: `passwordFrom(path, body)`, `PASSWORD_FIELDS` (existing, unchanged).
- Produces: `export const SESSION_PATHS: ReadonlySet<string>` in `pwned.ts`.

- [ ] **Step 1: Branch**

```bash
git switch -c fix/pwned-check-order
```

- [ ] **Step 2: Add the admin plugin and HTTP helpers to the test harness**

In `web/tests/pwned.test.ts`, change `makeAuth`'s plugins line from `plugins: [pwnedPasswordCheck(timeoutMs)],` to:

```ts
    plugins: [admin(), pwnedPasswordCheck(timeoutMs)],
```

Change the import line `import { PASSWORD_FIELDS, breachCount, passwordFrom, pwnedPasswordCheck } from "../src/lib/pwned";`
to:

```ts
import { PASSWORD_FIELDS, SESSION_PATHS, breachCount, passwordFrom, pwnedPasswordCheck } from "../src/lib/pwned";
```

After the `signUp` helper, add:

```ts
type Auth = ReturnType<typeof makeAuth>["auth"];
// An HTTP request as the browser sends it. auth.api calls without headers are server-side calls.
const post = (auth: Auth, path: string, body: object, cookie = "") =>
  auth.handler(
    new Request(`http://localhost:4321/api/auth${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:4321", cookie },
      body: JSON.stringify(body),
    }),
  );
// Signs up and in over HTTP; returns the Cookie header for later requests. Needs a fetch stub that answers clean.
async function signedIn(auth: Auth, email: string) {
  await signUp(auth, email);
  const res = await post(auth, "/sign-in/email", { email, password: SAFE });
  return res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
}
```

- [ ] **Step 3: Write the tests**

In the `describe("passwordFrom", …)` block, after the "matches better-auth's own routes" test, add:

```ts
  it("lists only password routes as session-gated", () => {
    for (const path of SESSION_PATHS) expect(Object.hasOwn(PASSWORD_FIELDS, path), path).toBe(true);
  });
```

At the end of the file, add:

```ts
describe("pwnedPasswordCheck and sessions", () => {
  it("skips the lookup for a signed-out request to a session-gated route, which the endpoint refuses with 401", async () => {
    const fetch = answer(BREACHED_RANGE);
    vi.stubGlobal("fetch", fetch);
    const { auth } = makeAuth();
    expect((await post(auth, "/change-password", { newPassword: BREACHED, currentPassword: SAFE })).status).toBe(401);
    expect((await post(auth, "/admin/set-user-password", { userId: "u1", newPassword: BREACHED })).status).toBe(401);
    expect((await post(auth, "/admin/create-user", { email: "x@example.test", password: BREACHED, name: "X" })).status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("still checks a signed-in password change", async () => {
    vi.stubGlobal("fetch", answer(CLEAN_RANGE));
    const { auth } = makeAuth();
    const cookie = await signedIn(auth, "k@example.test");
    const fetch = answer(BREACHED_RANGE);
    vi.stubGlobal("fetch", fetch);
    const res = await post(auth, "/change-password", { newPassword: BREACHED, currentPassword: SAFE }, cookie);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "PASSWORD_COMPROMISED" });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("still checks server-side calls, which /admin/create-user accepts without a session", async () => {
    vi.stubGlobal("fetch", answer(BREACHED_RANGE));
    await expect(makeAuth().auth.api.createUser({ body: { email: "l@example.test", password: BREACHED, name: "L" } })).rejects.toMatchObject({
      body: { code: "PASSWORD_COMPROMISED" },
    });
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `cd web && env -u NODE_ENV pnpm exec vitest run tests/pwned.test.ts`
Expected: exactly 2 failures, 19 passing (dry run, 2026-10-01). Vitest doesn't refuse a missing named export, it
imports `undefined`: "lists only password routes as session-gated" fails with `TypeError: SESSION_PATHS is not
iterable`, and the signed-out test fails with `expected 400 to be 401` (the hook looks up `BREACHED` today). The other
two new tests are regression guards and pass before and after. The PostToolUse lint hook reports `SESSION_PATHS`
missing and `signedIn` unused until Step 5: expected in the red phase.

- [ ] **Step 5: Implement**

In `web/src/lib/pwned.ts`, change the `better-auth/api` import to:

```ts
import { APIError, createAuthMiddleware, getAuthoritativeSessionFromCtx } from "better-auth/api";
```

After `PASSWORD_FIELDS`, add:

```ts
// Password routes that refuse a request without a session (401), using the same getAuthoritativeSessionFromCtx
// the hook calls. /admin/create-user also accepts server-side calls (no request, no headers) without one.
export const SESSION_PATHS: ReadonlySet<string> = new Set(["/change-password", "/admin/create-user", "/admin/set-user-password"]);
```

Replace the handler inside `pwnedPasswordCheck` with:

```ts
          handler: createAuthMiddleware(async (ctx) => {
            const password = passwordFrom(ctx.path, ctx.body);
            if (!password) return;
            // A request the endpoint will refuse with 401 isn't worth a lookup (nor a 503 during an outage).
            if (SESSION_PATHS.has(ctx.path) && (ctx.request || ctx.headers) && !(await getAuthoritativeSessionFromCtx(ctx))) return;
            if (await isBreached(password, timeoutMs)) {
              throw new APIError("BAD_REQUEST", {
                message: "The password you entered has been compromised. Please choose a different password.",
                code: "PASSWORD_COMPROMISED",
              });
            }
          }),
```

Replace the last three lines of the comment above `pwnedPasswordCheck` ("Fails closed: … (the rate limiter bounds
them).") with:

```ts
// Fails closed: if the lookup fails or takes longer than timeoutMs, the password is refused with a 503. It runs
// before the endpoint's own validation, so during an outage sign-up, reset and signed-in password changes get the
// 503 (the rate limiter bounds them); signed-out requests to session-gated routes skip it and get their 401.
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd web && env -u NODE_ENV pnpm exec vitest run tests/pwned.test.ts`
Expected: PASS (all tests, including the existing reset-link and outage tests).

- [ ] **Step 7: Lint and type-check**

Run: `cd web && env -u NODE_ENV pnpm lint && env -u NODE_ENV pnpm check`
Expected: no errors.

- [ ] **Step 8: Commit**

Empty the auto-memory dirty files (separate call):

```bash
for f in .claude/auto-memory/dirty-files*; do [ -f "$f" ] && : > "$f"; done
```

```bash
git add web/src/lib/pwned.ts web/tests/pwned.test.ts docs/superpowers/plans/2026-10-01-pwned-check-order.md
git commit -m "Pwned check: skip the lookup for signed-out requests to session-gated routes

/change-password and /admin/set-user-password refuse a request without a session (401) through
getAuthoritativeSessionFromCtx; /admin/create-user does too when it has a request or headers (better-auth 1.7.7
api/routes/session.mjs, plugins/admin/routes.mjs). The hook now asks the same question first, so those requests
cost no lookup and get their 401 during an outage instead of a 503. Server-side calls are still checked.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Enforce the length limits before the lookup

**Files:**

- Modify: `web/src/lib/pwned.ts` (import, the handler)
- Modify: `web/src/lib/auth.ts` (`minPasswordLength: 12`); test: `web/tests/auth-config.test.ts`
- Modify: `web/src/pages/sign-up.astro`, `web/src/pages/reset-password.astro` (`minlength="12" maxlength="128"`)
- Modify: `.claude/rules/web-architecture.md` (the `src/lib/pwned.ts` entry)
- Test: `web/tests/pwned.test.ts`

**Interfaces:**

- Consumes: `SESSION_PATHS` and the handler from Task 1; `ctx.context.password.config.{minPasswordLength,
  maxPasswordLength}` (better-auth, defaults 8 and 128).
- Produces: nothing new for other tasks.

- [ ] **Step 1: Write the test**

At the end of `web/tests/pwned.test.ts`, add:

```ts
describe("pwnedPasswordCheck and length limits", () => {
  // The lower bound itself is still looked up: BREACHED ("password") is exactly 8 characters.
  it("reports a too-short or too-long password as such, without a lookup", async () => {
    const fetch = answer(BREACHED_RANGE);
    vi.stubGlobal("fetch", fetch);
    const { auth } = makeAuth();
    await expect(signUp(auth, "m@example.test", "pass")).rejects.toMatchObject({ body: { code: "PASSWORD_TOO_SHORT" } });
    await expect(signUp(auth, "m@example.test", "p".repeat(129))).rejects.toMatchObject({ body: { code: "PASSWORD_TOO_LONG" } });
    expect(fetch).not.toHaveBeenCalled();
  });

  // better-auth 1.7.7's /admin/create-user checks only the maximum; the hook applies the minimum there too.
  it("refuses a too-short password on /admin/create-user", async () => {
    const fetch = answer(CLEAN_RANGE);
    vi.stubGlobal("fetch", fetch);
    await expect(makeAuth().auth.api.createUser({ body: { email: "n@example.test", password: "pass", name: "N" } })).rejects.toMatchObject({
      body: { code: "PASSWORD_TOO_SHORT" },
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd web && env -u NODE_ENV pnpm exec vitest run tests/pwned.test.ts -t "length limits"`
Expected: 2 failures (dry run): the first with `expected "vi.fn()" to not be called at all, but actually been called
2 times` (the hook looks up both before the endpoint reports their length), the second with `promise resolved … instead
of rejecting` (`createUser` has no minimum today).

- [ ] **Step 3: Implement**

In `web/src/lib/pwned.ts`, change `import type { BetterAuthPlugin } from "better-auth";` to:

```ts
import { BASE_ERROR_CODES, type BetterAuthPlugin } from "better-auth";
```

In the handler, between the session line and `if (await isBreached(…))`, add:

```ts
            // The endpoints' own length rules, first, so a short password is reported as short (not compromised) and
            // costs no lookup. /admin/create-user checks only the maximum in better-auth 1.7.7: this adds the minimum.
            const { minPasswordLength, maxPasswordLength } = ctx.context.password.config;
            if (password.length < minPasswordLength) throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.PASSWORD_TOO_SHORT);
            if (password.length > maxPasswordLength) throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.PASSWORD_TOO_LONG);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd web && env -u NODE_ENV pnpm exec vitest run tests/pwned.test.ts`
Expected: PASS (whole file).

- [ ] **Step 5: Raise the site minimum to 12 (user decision, 2026-10-01)**

One rule for every password route: better-auth's sign-up, reset and change-password read `minPasswordLength`, and
the hook (Step 3) applies the same value to `/admin/create-user`. Sign-in checks only the maximum, so any existing
8-11 character password keeps working (none exist: never deployed).

In `web/tests/auth-config.test.ts`, append:

```ts
describe("password length", () => {
  it("requires 12 to 128 characters (the hook applies the same rule to /admin/create-user)", () => {
    expect(options.emailAndPassword?.minPasswordLength).toBe(12);
    expect(options.emailAndPassword?.maxPasswordLength ?? 128).toBe(128);
  });
});
```

Run: `cd web && env -u NODE_ENV pnpm exec vitest run tests/auth-config.test.ts`. Expected: FAIL (`undefined` is not 12).

In `web/src/lib/auth.ts`, inside `emailAndPassword`, after `requireEmailVerification: true,` add:

```ts
    // Every password route reads this, and the breached-password hook (pwned.ts) applies it to /admin/create-user.
    minPasswordLength: 12,
```

Run the same test. Expected: PASS.

- [ ] **Step 6: Match the forms to the server's 12-128 rule**

So a too-short or too-long password is caught in the browser instead of after a round trip, in both
`web/src/pages/sign-up.astro` (line 20) and `web/src/pages/reset-password.astro` (line 15), change:

```html
type="password" required minlength="8" autocomplete="new-password"
```

to:

```html
type="password" required minlength="12" maxlength="128" autocomplete="new-password"
```

No test: static attributes; `pnpm check` covers the markup and E2E fills ~40-character passwords. (`maxlength` stops
typing and pasting past 128; the server check in Step 3 still covers direct API calls.)

- [ ] **Step 7: Update the file map**

In `.claude/rules/web-architecture.md`, replace the two `src/lib/pwned.ts` lines:

```text
  src/lib/pwned.ts     pwnedPasswordCheck(): Have I Been Pwned in a before hook (ahead of the reset-token
                       consume), fetch aborted after 5 s; fails closed with a 503, logged
```

with:

```text
  src/lib/pwned.ts     pwnedPasswordCheck(): Have I Been Pwned in a before hook (ahead of the reset-token
                       consume), after the length rules and, on session-gated routes, the session check; fetch
                       aborted after 5 s; fails closed with a 503, logged
```

- [ ] **Step 8: Full web checks**

Run: `cd web && env -u NODE_ENV pnpm test && env -u NODE_ENV pnpm lint && env -u NODE_ENV pnpm check`
Expected: all pass.

- [ ] **Step 9: Commit**

Empty the auto-memory dirty files (separate call):

```bash
for f in .claude/auto-memory/dirty-files*; do [ -f "$f" ] && : > "$f"; done
```

```bash
git add web/src/lib/pwned.ts web/tests/pwned.test.ts web/src/lib/auth.ts web/tests/auth-config.test.ts \
  web/src/pages/sign-up.astro web/src/pages/reset-password.astro .claude/rules/web-architecture.md
git commit -m "Passwords: 12-128 characters everywhere, checked before the breach lookup

A breached password that was also too short was reported as compromised, and cost a lookup. The hook now applies
better-auth's minPasswordLength/maxPasswordLength first, with its PASSWORD_TOO_SHORT/PASSWORD_TOO_LONG codes.
/admin/create-user checks only the maximum in 1.7.7 (plugins/admin/routes.mjs), so it now refuses passwords
under the minimum too. The minimum rises from better-auth's default 8 to 12, and the sign-up and reset forms
enforce 12-128 in the browser.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Verify the whole stack and open the PR

**Files:** none changed.

- [ ] **Step 1: Run /verify**

Invoke the `verify` skill (lint, type-check, Markdown, web checks, Aspire smoke test, Playwright E2E). The E2E
sign-up and password-reset flows exercise the hook against the running stack.
Expected: every step PASS.

- [ ] **Step 2: Ask the user before pushing**

Pushing and opening the PR need explicit approval. Once approved, push `fix/pwned-check-order` and open a PR using
`.github/pull_request_template.md`. Put the Findings table's item 2 verdict (no change, with evidence) in the PR
body, so the "no path" note isn't re-raised.
