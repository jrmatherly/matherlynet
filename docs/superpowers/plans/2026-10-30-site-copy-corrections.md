# Site Copy Corrections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every gateway and platform claim on matherly.net match the facts Jason confirmed on 2026-10-22 and
2026-10-30, and finish removing the school name from the public repository.

**Architecture:** All résumé-derived copy lives in `web/src/data/profile.ts` and is read by the pages, the share cards
(`web/src/lib/og.ts`) and the case-study component. Edits go definition-first (the data file, then the post and the
components that read it). A ban test in `web/tests/pages.test.ts` and a post-file test in `web/tests/content.test.ts`
pin the removed phrases so they cannot come back, in the style of the existing "nearly 17" ban.

**Tech Stack:** Astro 7 SSR, Vitest with the Astro Container API, pnpm, markdownlint.

**Spec:** `/Users/jason/dev/job-search/private/findings/matherlynet/2026-10-30-gateway-case-study-fixes.md` (section 1,
the corrections, and section 5, the do-not list) and finding 6 of `docs/superpowers/specs/2026-10-30-project-audit.md`.

## Global Constraints

- Keep every figure as it is: `$100K+`, `about $38K`, `near zero`, `about 15 million`, `about 2 billion`,
  `about 20 MCP servers`, `about 30 agents`, `99.999%`.
- Never write "sole builder", "built it alone", "400 users across 14 teams" (or "across 400 users and 14 teams") on
  the gateway or chat platform, or "Go" on the chat platform.
- Never claim AWS, EKS, Bedrock, Crossplane, GitLab, Datadog, SLOs or error budgets, certifications, or a named
  open-source agent framework.
- Keep the non-breaking hyphen (U+2011) in `15,000‑person` in `headline`; `og.ts` swaps it for the card.
- Do not write `[open]` placeholders into the site. A fact Jason has not supplied stays out until he supplies it.
- Markdown stays under 120 columns; `.mdx` posts carry no table column alignment.
- Order edits definition-first (`profile.ts`, then its readers), then run `eslint` and `astro check` once.
- Do not push, publish or deploy without Jason's go. Commits are SSH-signed; if signing fails, leave the work staged.

## Review Focus

- The two Cta variants: home and about say "Hiring for a platform that has to work on Monday?"; work, changelog and
  playground say "If a platform has to work on Monday, let's talk." Changing one page and not the others leaves the
  site inconsistent. Task 3 edits all five and the ban test covers the rendered pages.
- The /work share-card title duplicates the /work H1 in `og.ts`. A visitor sharing /work would see the old line.
  Task 3 changes both and the test asserts `ogCards.work.title` equals the H1 text.
- The home share card reuses `headline`; it changes on its own, and the ban test covers `ogCards`.
- The longer Kubernetes card summary is about three times its neighbours' length. Task 2's live check views /work at
  phone width so a wrapped card is seen, not guessed.
- `pages.test.ts` renders pages with the Container API but Vitest sees no posts on a clean checkout, so the post's
  phrases are pinned by reading the `.mdx` file in `content.test.ts`, not by rendering it.

---

### Task 1: Pin the removed phrases with failing tests

**Files:**

- Modify: `web/tests/pages.test.ts:80-83`
- Modify: `web/tests/content.test.ts:43-48`

**Interfaces:**

- Consumes: the `pages`, `profile` and `ogCards` values the existing ban test already builds.
- Produces: `BANNED` regex in `pages.test.ts`, reused by Task 3's share-card assertion.

- [ ] **Step 1: Extend the page ban test**

In `web/tests/pages.test.ts`, replace the regex on line 82 with a named constant and add the new phrases:

```ts
const BANNED = /nearly 17|Manager of Infrastructure|built it alone|sole builder|single-handedly|(across )?400 users (across|and) 14 teams/i;
```

Rename the test to `never repeats a retired claim on a page, in the profile data or on a share card` and assert
`expect(text).not.toMatch(BANNED)` for each text. Also raise the result cap in `profile.test.ts:45` from 110 to 130:
the spec's automation result is 128 characters and Jason confirmed its wording.

- [ ] **Step 2: Add the post-file ban test**

In `web/tests/content.test.ts`, after the table-alignment test, add:

```ts
it("never repeats a retired claim in a post", () => {
  const dir = new URL("../src/content/writing/", import.meta.url);
  for (const file of readdirSync(dir)) {
    expect(readFileSync(new URL(file, dir), "utf8"), file).not.toMatch(/built it alone|sole builder|single-handedly|400 users (across|and) 14 teams/i);
  }
});
```

- [ ] **Step 3: Run both tests and confirm they fail**

Run: `cd web && pnpm vitest run tests/pages.test.ts tests/content.test.ts`
Expected: FAIL. The page test fails on `JSON.stringify(profile)` (`400 users across 14 teams` and the career
highlight `single-handedly` at `profile.ts:277`) and the rendered home page (`built it alone`); the post test fails on
`ai-gateway-three-generations.mdx`.

- [ ] **Step 4: Stage, do not commit**

The tests stay red until Task 3; they are committed with Task 3's change so every commit on the branch passes.

### Task 2: Correct the profile data

**Files:**

- Modify: `web/src/data/profile.ts:7,16,27,28,32,39,132,134,140,147,149,171`

**Interfaces:**

- Consumes: nothing.
- Produces: the same exports with new strings; no export is added or renamed, so no reader changes for this task.

- [ ] **Step 1: Apply the string replacements, each verbatim from the spec**

| Line | Field | New text |
| :--- | :--- | :--- |
| 7 | `headline` | `Every AI request at a 15,000‑person company runs through the platform I designed and run.` |
| 16 | `intro[1]` | `Now I lead its move into *agentic AI*. The gateway carries about *2 billion tokens a month* and took projected licensing from $100K+ a year to near zero.` |
| 27 | `gateway.generations[0].note` | starts `It was fast to stand up and it proved the demand. It couldn't attribute cost ...` (rest unchanged) |
| 28 | `gateway.generations[1].note` | `Added SSO and rate limits, and cut projected licensing to about $38K a year. Every further capability became a custom integration bounded by what Azure allows.` |
| 32 | `gateway.generations[2].note` | `Full control. Cost per user and team, routing across Azure AI Foundry and Anthropic, and guardrails, rate limits and an audit log on every call. Rebuilt in August 2026 on an open-source base, TokenHub, maintained as AIOps Hub.` |
| 39 | `gateway.results[2].label` | `signed in, rate limited, logged for 90 days` |
| 132 | chat platform `summary` | `... built in Python and TypeScript. Designed the retrieval pipeline ...` |
| 134 | chat platform `result` | `About 30 agents grounded in company knowledge, used company-wide` |
| 140 | AI Gateway `summary` | append `The current generation is a Go backend with a Next.js console, running on the on-prem Talos Kubernetes clusters through GitOps.` |
| 147 | Kubernetes `summary` | the spec's 1.6 text, starting `100-plus nodes across three on-prem Talos Linux clusters, ...` |
| 149 | Kubernetes `result` | `Runs the AI Gateway, the MCP platform and the chat platform, managed through GitOps` |
| 171 | automation `result` | `Dozens of tickets a week removed; the DBA team's VM self-service alone handles about 50 requests a week at 10 minutes saved each` |
| 277 | career highlight (2024, /changelog) | `Built the AI Gateway and launched it on LiteLLM in December at 15 million tokens a month` (drops `single-handedly`; the spec does not name this line, so Jason confirms the wording) |

Leave `bio` (line 54) as it is unless Jason chooses the shorter ending; the spec marks it his call.

- [ ] **Step 2: Run the profile and page tests**

Run: `cd web && pnpm vitest run tests/profile.test.ts tests/pages.test.ts tests/home.test.ts`
Expected: `profile.test.ts` and `home.test.ts` PASS (the gateway figure data is untouched, so the two SVG snapshots
match). `pages.test.ts` still FAILS on the home page's `built it alone` (Task 3).

- [ ] **Step 3: Commit**

```bash
git add web/src/data/profile.ts
git commit -m "fix(profile): state the gateway and platform facts as confirmed"
```

### Task 3: Correct the readers: case study, post, work page, share card and call to action

**Files:**

- Modify: `web/src/components/CaseStudy.astro:8`
- Modify: `web/src/content/writing/ai-gateway-three-generations.mdx:13,17,18,19,39-41`
- Modify: `web/src/pages/work.astro:16-19,46`
- Modify: `web/src/lib/og.ts:11`
- Modify: `web/src/pages/index.astro:39`, `web/src/pages/about.astro:63`, `web/src/pages/changelog.astro:76`,
  `web/src/pages/playground.astro:28`
- Test: `web/tests/pages.test.ts`

**Interfaces:**

- Consumes: `BANNED` from Task 1.
- Produces: nothing new.

- [ ] **Step 1: Add the share-card assertion**

In `web/tests/pages.test.ts`, next to the ban test:

```ts
it("titles the /work share card with the /work heading", async () => {
  const html = await page(Work, "/work");
  expect(html.match(/<h1[^>]*>([^<]*)<\/h1>/)?.[1]).toBe(esc(ogCards.work.title));
});
```

`page()` and `esc()` are the file's existing helpers (`pages.test.ts:25` and the h1 assertion at line 37); `esc` matters
because the new title's apostrophe renders as `&#39;`.

- [ ] **Step 2: Run it and confirm it passes today, then keep it as the guard for this task**

Run: `cd web && pnpm vitest run tests/pages.test.ts -t "share card"`
Expected: PASS (both strings are still the old line). It fails if Step 4 changes only one of them.

- [ ] **Step 3: Edit the case study and the post**

- `CaseStudy.astro` line 8: `Every model call at the company goes through it. I designed it and rebuilt it twice in
  eighteen months.`
- `.mdx` line 13: `I designed it, then rebuilt it twice in eighteen months.`
- `.mdx` line 17: `- **Role:** architect and lead engineer; Manager, Infrastructure Services. My four-engineer team
  runs it with me.`
- `.mdx` line 18: `- **Timeline:** built December 2024 to August 2026; in-house since June 2026, the current generation
  since August 2026` (the spec's 1.4 facts contradict "in production since June 2026"; Jason confirms the wording)
- `.mdx` line 19: `- **Scale:** from about 15 million tokens a month at launch to about 2 billion` (no user count; the
  as-of month is added when Jason supplies it)
- `.mdx` lines 39 to 41, rewrapped under 120 columns (`.mdx` is outside the markdownlint globs, so wrap by hand):

```text
Moving to Azure API Management added single sign-on and rate limits, and cut projected licensing to about $38,000 a
year. But every capability the business asked for next became a custom integration, and those were bounded by
what Azure allows.
```

Do not add the generation 3 provenance paragraph or the TokenHub line in "Choosing to build": both need the two open
facts (the June build's language and name, the one-clause reason for the August rebuild).

- [ ] **Step 4: Edit the work page and its share card together**

- `work.astro` line 16 H1: `Platforms I designed, built and run at The Aaron's Company.`
- `work.astro` lines 17 to 19: shorten the paragraph to `From the AI platform down to the store network, at
  <a href="/changelog" class={inlineLink}>The Aaron's Company</a>.` The link stays in this paragraph: it is the page's
  only `/changelog` link and `pages.test.ts:74` requires one in the body (`Cta.astro` and `WorkCard.astro` have none).
- `og.ts` line 11: `work: { title: "Platforms I designed, built and run at The Aaron's Company.", subtitle: ... }`
  (subtitle unchanged).

- [ ] **Step 5: Replace the call to action on all five pages**

Title `Ask me about the gateway, the MCP registry or the Kubernetes platform.` and body
`Or about how we went from LiteLLM to Azure API Management to an in-house gateway.` on `work.astro:46`,
`changelog.astro:76`, `playground.astro:28`, `index.astro:39` and `about.astro:63`. Default decision: all five
identical; Jason may prefer to keep two variants (Review Focus).

- [ ] **Step 6: Run the whole web check**

Run, with the stack stopped (`astro check` under a running stack stales the dev server's Vite deps; otherwise
`aspire resource web restart` afterwards): `cd web && pnpm check && pnpm lint && pnpm test`
Expected: astro check 0 errors, ESLint clean, all tests PASS including the two ban tests and the share-card test.

- [ ] **Step 7: Commit, with Task 1's tests**

```bash
git add web/src web/tests
git commit -m "fix(copy): credit the team, drop the user count and unslop the work page"
```

### Task 4: Remove the school from the two completed documents and PR #24

**Files:**

- Modify: `docs/superpowers/plans/completed/2026-10-02-home-and-changelog-redesign.md:979,996,1037` (three lines
  naming the school; `git grep -in kennesaw -- docs` lists them)
- Modify: `docs/superpowers/specs/completed/2026-10-02-home-and-changelog-design.md:48` (one line)

**Interfaces:** none.

- [ ] **Step 1: Edit the four lines**

Replace each school mention with `[education]` so the historical documents still read, and drop the degree years
where they appear beside it (line 1037 carries `2008 to 2012`).

- [ ] **Step 2: Confirm nothing tracked names it**

Run: `git grep -il "kennesaw\|southern poly" -- . ; echo "exit=$?"`
Expected: no paths, `exit=1`. Then `markdownlint-cli2 docs/superpowers/**/*.md` prints `0 issues`.

- [ ] **Step 3: Edit the PR body**

The body names no school; it says the degree years stay `2008 to 2012` (its line 22) and names the education section
(line 20). Run `gh pr view 24 --json body -q .body > /tmp/pr24.md`, drop the degree years and the sentence about them,
then `gh pr edit 24 --body-file /tmp/pr24.md`. This edits a public page and needs Jason's go in chat before it runs.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers
git commit -m "docs: remove the school from the completed plan and spec"
```

### Task 5: Verify on the running site and open the PR

**Files:** none.

- [ ] **Step 1: Build and view**

Run: `cd web && pnpm build` (expected: `Complete!`), then `aspire start` from the repo root and, with the stack up,
open `/`, `/work`, `/about`, `/changelog` and `/writing/ai-gateway-three-generations` at 390 px and desktop width
through the chrome-devtools skill. Save screenshots of the /work cards and the home case-study paragraph.
Expected: no phrase from the Global Constraints appears (`curl -s http://localhost:4321/<path> | grep -ciE "built it
alone|sole builder|single-handedly|400 users"` prints 0 for each page), the Kubernetes card wraps without overflow at
390 px, and the Cta reads the same on all five pages.

- [ ] **Step 2: Run the repo check**

Run: `/verify --no-stack` (or the full `/verify` with the stack up).
Expected: every step PASS.

- [ ] **Step 3: Open the PR**

One PR, `fix/site-copy-corrections`, body per `.github/pull_request_template.md` with the screenshots as verification
evidence and "no deployment impact beyond a content release". `/simplify` then `/code-review` on the branch diff
before pushing. Push only on Jason's go.

## Out of scope

The six-section case-study redraft (spec section 2) and the next case studies (section 3) are separate plans, written
once the open facts below arrive.

## Open decisions for Jason

- The as-of month for "about 2 billion tokens a month" (spec 1.2).
- The June 2026 build's language and name, and the one-clause reason for the August TokenHub rebuild (spec 1.4).
- Whether `bio` drops "or risk" (spec 1.5).
- Whether the five calls to action share one wording (this plan's default) or keep the two variants.
