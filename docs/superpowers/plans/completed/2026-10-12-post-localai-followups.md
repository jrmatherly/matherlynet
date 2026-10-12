# Post-LocalAI Follow-ups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the three items left open after chart 0.42.1 shipped: the site copy that still names only agents as
MCP tool callers, the playground seat count against LocalAI's four slots, and Renovate's pending GitHub Actions update.

**Architecture:** Three independent tasks on `main`, each its own branch and PR. Task 1 is a copy change in the
profile data module (the pages render it; no layout work). Task 2 is a decision recorded in code: keep `LIVE.seats`
at 3 and say why against LocalAI, or raise it to 4 and move every number that follows it. Task 3 is a Renovate PR
the owner opens from the dashboard and this repo reviews and merges.

**Tech Stack:** Astro 7 SSR (`web/`), Vitest, Playwright, Aspire 13.6.1 AppHost, Renovate, GitHub Actions pinned
to commit SHAs.

**Spec:** No spec document. The findings are from the 2026-10-12 session, recorded in `.remember/remember.md`
(handoff), the memory note `playground-self-hosted-llm` (LocalAI contract, measured by the home-cluster session), and
PRs #29 and #30. The facts each task argues from are restated in its "Findings" block below.

## Global Constraints

- Owner-supplied wording in `web/src/data/profile.ts` is the owner's: never invent or placeholder it (AGENTS.md,
  "Owner-supplied wording stays `null`..."). Task 1 ships only sentences Jason has approved.
- Commits are SSH-signed through 1Password: Jason must be at the keyboard. Pushes to `main` and merges need his go,
  and the auto-mode classifier refuses `gh pr merge`, so he runs the merge commands.
- The auto-memory commit gate re-blocks after its agent runs: run the memory-updater as the hook says, then
  truncate `.claude/auto-memory/dirty-files-<session id>` in its own Bash call, then commit in a separate call.
- Before every commit: `/simplify` then `/code-review` on the diff (j-mode). Before review, read and apply the jstack
  `no-comments` skill (`/jstack:no-comments`; it is read, not invoked).
- Markdown: 120 columns, top-level heading first (`markdownlint-cli2`).
- PR bodies follow `.github/pull_request_template.md`: `# Summary`, `## Changes`, `## Verification` (its three
  checkboxes), `## Deployment impact`, `## Docs`. Tick what applies and say "none" where nothing does.
- GitHub Actions stay pinned to full commit SHAs with a `# vX.Y.Z` comment; run `actionlint`.
- Never `vitest -u` on the gateway snapshots. Never call the cluster's LocalAI from this repo; verify the playground
  through matherly.net only.
- Dependencies: exact pins; the caps in AGENTS.md and `.github/renovate.json5` hold (TypeScript 6.0.x,
  `@types/node` 24.x, `vscode-jsonrpc` 8.x).

## Review Focus

1. A copy edit in Task 1 that makes the /work summary or the home bullet longer than its card expects: the pages
   wrap prose, but `pages.test.ts` pins that /work and / still render the profile data, so run it after the edit.
2. Task 2 with seats raised to 4 but `IN_FLIGHT_MAX` (twice the seats) left in comments and AGENTS.md as 6: the
   unit test `playground-io.test.ts` "in flight" cases read the constant, so they move with it, but the prose does
   not. The task lists every prose line.
3. Task 2 with seats at 4 while the home-cluster runs anything else against LocalAI: four visitors would queue
   that consumer. The task's default keeps 3 for this reason; raising it is Jason's call only.
4. Task 3's Renovate PR edits `web-checks.yml` and `e2e.yml`, and each lists its own file in its `pull_request`
   paths (`web-checks.yml:3-6`, `e2e.yml:3-13`), so both run on the PR; `publish-images.yml` runs on `main` after
   the merge because its own file is in its include list. Verify on the PR first, then on `main`.
5. Task 3 landing a release that renames an input the workflows pass: `node-version` (`setup-node`), `name`, `path`,
   `retention-days` and `if-no-files-found` (`upload-artifact`, `download-artifact`). The dashboard lists patch and
   minor targets only (`setup-node` v7.1.0, `upload-artifact` v7.0.2, `download-artifact` v8.0.2), so a rename is
   unlikely, but the release notes are read before the merge.

---

### Task 1: Name end users among the MCP tool callers in the site copy

**Findings.** Jason confirmed on 2026-10-12 that the internal AI chat platform calls MCP servers through the MCP
Gateway on end users' behalf. PR #29 made the code agree (`TOOL_CALLERS` deleted; the playground's tool lane takes
any `Caller`). Two strings in `web/src/data/profile.ts` still describe tool traffic as agents-only. Neither is false,
both are incomplete. No test pins their literal text (`grep` of `web/tests` and `web/e2e` for "company agents",
"any agent can call" and "reach internal systems" finds nothing); `pages.test.ts` checks that /work and / render the
profile data, not these sentences.

**Files:**

- Modify: `web/src/data/profile.ts:97` (security perspective `body`), `:100` (security perspective bullet), `:125`
  (work item "MCP Gateway, Registry & Portal" `summary`)
- Test: `web/tests/pages.test.ts` (renders /work and /), `web/tests/home.test.ts`

**Interfaces:**

- Consumes: nothing from other tasks.
- Produces: nothing other tasks rely on.

- [ ] **Step 1: Get the wording from Jason**

The current text, each sentence to keep, change or replace at his word:

```text
profile.ts:97  "... Tools sit behind the MCP Gateway, which reaches only servers approved into the registry, over OAuth."
profile.ts:100 "About 20 MCP servers, each approved into the registry before any agent can call it"
profile.ts:125 "How Claude Code, Claude Desktop and company agents reach internal systems and data. A server is
                approved into the registry once; from then on, every call to it goes through the MCP Gateway."
```

A proposal for him to accept or edit, not to commit unless he does: line 100 "before any agent or the chat platform
can call it"; line 125 "How Claude Code, Claude Desktop, company agents and the AI chat platform's users reach
internal systems and data." Line 97 already names no caller, so it can stay. One more candidate with the same framing,
his call: `profile.ts:268`, the 2025 changelog milestone heading "Tools and agents behind a gateway, too". If he
answers "leave it", close the
task with no commit.

- [ ] **Step 2: Branch**

```bash
cd /Users/jason/dev/matherlynet && git switch -c docs/mcp-callers-copy main
```

- [ ] **Step 3: Apply the approved sentences**

Edit only the two string literals with the Edit tool (exact `old_string` from Step 1, `new_string` as approved).
No other line changes.

- [ ] **Step 4: Run the page tests and lint**

```bash
cd web && pnpm exec vitest run tests/pages.test.ts tests/home.test.ts && pnpm exec eslint src/data/profile.ts
```

Expected: both files pass; ESLint "No issues found".

- [ ] **Step 5: See it rendered**

With the stack running (`aspire start`), open `http://localhost:4321/work` and `http://localhost:4321/` and read the
MCP Gateway card and the Security & governance panel. Then `cd web && pnpm build` to prove the build still passes.

- [ ] **Step 6: Commit and open the PR**

Run `/simplify` and `/code-review` on the diff (both should return nothing for a two-string change; say so in the PR).
Then, after the memory-updater and marker steps from Global Constraints:

```bash
git add web/src/data/profile.ts
git commit -m "feat(profile): name end users among the MCP tool callers"
git push -u origin docs/mcp-callers-copy
gh pr create --base main --title "feat(profile): name end users among the MCP tool callers"
```

PR body on the template: Summary (the owner confirmed the chat platform calls MCP servers for end users; PR #29
changed the code, this changes the copy), Changes (the two strings by line), Verification (`/verify` unticked with
"copy only: pages.test.ts, home.test.ts and the build ran", the other two unticked as n/a), Deployment impact (none),
Docs (none).
Jason merges with `gh pr merge <n> --squash --delete-branch`.

---

### Task 2: Decide `LIVE.seats` against LocalAI's four slots

**Findings.** `LIVE.seats` (`web/src/lib/playground.ts:80`) is 3, with the comment "3 of the server's 4 slots, one
left for the owner's other consumers". The home-cluster session measured LocalAI on 2026-10-12: four parallel slots
of 16384 tokens, a fifth request queues. So the reservation reason still holds. `IN_FLIGHT_MAX` in
`web/src/lib/playground-io.ts:552` is `LIVE.seats * 2`, the playground pg pool in `web/src/db/index.ts` is sized to
it (6, named in its comment), the /playground live values row prints "3 answers at a time", the busy sentence prints
"All 3 seats are taken", and the E2E test at `web/e2e/live.spec.ts:286` sends four slow calls and expects three
seated and one busy. AGENTS.md says "at most three are seated at once" and "Each process holds at most 6 calls".

**Recommendation (validated): keep 3.** The playground is not LocalAI's only consumer (the comment's reason, which
Jason has not withdrawn), and a fourth seat buys one more concurrent visitor at the cost of queuing everything else
he runs against the server. The only code change is the comment, which still says "the server's 4 slots" and is
true for LocalAI too, so there is nothing to commit. Default outcome: close with no change.

**If Jason chooses 4**, the task below moves every dependent number together.

**Files:**

- Modify: `web/src/lib/playground.ts:79-80` (comment and `seats`)
- Modify: `web/src/db/index.ts:35-36` (`newPool(6)` and the comment's "6"; `playground-io.test.ts:543` pins the pool
  `max` to `IN_FLIGHT_MAX`, and `:588` pins `IN_FLIGHT_MAX` to 6)
- Modify: `web/tests/playground-io.test.ts:587-589` (the title "at six calls in flight", `toBe(6)`, `Array(6)`)
- Modify: `web/tests/fake-llama.ts:4` (comment "so four calls overlap")
- Modify: `docs/deployment.md:292` ("3 of the server's 4"), `:302` ("`newPool(6)`"), `:306` ("at most three hold one at
  once and a fourth is refused")
- Modify: `web/tests/playground.test.ts:394` (busy sentence literal "All 3 seats")
- Modify: `web/e2e/live.spec.ts:286-299` (four calls, three seated: becomes five calls, four seated)
- Modify: `AGENTS.md` (three sentences: "at most three are seated at once", "Each process holds at most 6 calls",
  "pool of 6 connections")
- Unchanged: `web/src/lib/playground-io.ts:552` (`IN_FLIGHT_MAX = LIVE.seats * 2` moves by itself)

**Interfaces:**

- Consumes: nothing from other tasks.
- Produces: nothing other tasks rely on.

- [ ] **Step 1: Confirm the choice with Jason**

Ask: keep 3 (recommended) or raise to 4? If 3, record "kept at 3 on 2026-10-12: LocalAI has 4 slots, one stays free
for the owner's other consumers" in `.remember/remember.md` and stop. The steps below are for 4.

- [ ] **Step 2: Branch**

```bash
cd /Users/jason/dev/matherlynet && git switch -c feat/playground-four-seats main
```

- [ ] **Step 3: Move the unit-test expectations first**

In `web/tests/playground.test.ts:394` change the literal:

```ts
      `Refused at Routing. All 4 seats are taken. Try again in a few seconds. ${logged}`,
```

In `web/tests/playground-io.test.ts:587-589` change the three literals (the title, the pin and the fill):

```ts
  it("at eight calls in flight, one per connection in the playground's pool: ...", async () => {
    expect(IN_FLIGHT_MAX).toBe(8);
    expect(fill().map((res) => res.status)).toEqual(Array(8).fill(200));
```

(keep the rest of the title as it is on line 587; only "six" becomes "eight").

Run: `cd web && pnpm exec vitest run tests/playground.test.ts tests/playground-io.test.ts`
Expected: FAIL on those two cases ("All 3 seats" rendered; `IN_FLIGHT_MAX` is 6). The live-values case at
`playground.test.ts:307` reads `LIVE.seats` and keeps passing.

- [ ] **Step 4: Change the constant and its comment**

`web/src/lib/playground.ts:79-80`:

```ts
  /** Calls holding a seat at once, site-wide: all 4 of LocalAI's slots (measured 2026-10-12). A fifth call queues there. */
  seats: 4,
```

Run: `cd web && pnpm exec vitest run tests/playground.test.ts tests/playground-io.test.ts`
Expected: `playground.test.ts` passes; `playground-io.test.ts:543` now FAILS because the pool `max` is still 6 while
`IN_FLIGHT_MAX` is 8. That failure is the pin working.

- [ ] **Step 5: Pool size and prose**

`web/src/db/index.ts:35-36`: `newPool(6)` becomes `newPool(8)` and the comment's "6: one per call" becomes "8: one
per call". Keep the literal: the comment says a test pins the two together, and `db/index.ts` importing
`playground-io.ts` would be a cycle (`playground-io.ts` imports `playgroundDb` from `../db`).

Run: `cd web && pnpm exec vitest run tests/playground-io.test.ts`
Expected: PASS.

AGENTS.md: "at most three are seated at once" becomes "at most four", "Each process holds at most 6 calls" becomes
"at most 8 calls", and the `playgroundDb` sentence "pool of 6 connections" becomes "pool of 8 connections".
`docs/deployment.md:292` "3 of the server's 4" becomes "4 of the server's 4", `:302` "`newPool(6)`" becomes
"`newPool(8)`", `:306` "at most three hold one at once and a fourth is refused" becomes "at most four hold one at once
and a fifth is refused". `web/tests/fake-llama.ts:4` "so four calls overlap" becomes "so five calls overlap".

Run: `markdownlint-cli2 AGENTS.md docs/deployment.md`
Expected: "0 issues".

Run: `markdownlint-cli2 AGENTS.md`
Expected: "0 issues".

- [ ] **Step 6: Move the E2E seat test**

`web/e2e/live.spec.ts:286-299`: title "of five slow calls at once, exactly four take a seat and one is busy"; the
array `[1, 2, 3, 4]` becomes `[1, 2, 3, 4, 5]`; the two `toHaveLength(3)` become `toHaveLength(4)`. The per-process
cap (now 8) still admits all five, so the busy refusal is the seat lock, which is what the test proves.

Run (stack up with the fake model, see AGENTS.md "Live playground with a fake model"):

```bash
cd web && env -u NODE_ENV pnpm exec playwright test e2e/live.spec.ts
```

Expected: all live tests pass, this one with four `routed` and one `busy`.

- [ ] **Step 7: Full verify, commit, PR**

Run `/verify` (all eleven steps PASS), then `/simplify` and `/code-review` on the diff, then the memory-updater and
marker steps, then:

```bash
git add web/src/lib/playground.ts web/src/db/index.ts web/tests/playground.test.ts web/tests/playground-io.test.ts \
  web/tests/fake-llama.ts web/e2e/live.spec.ts AGENTS.md docs/deployment.md
git commit -m "feat(playground): seat four live calls against LocalAI's four slots"
git push -u origin feat/playground-four-seats
gh pr create --base main --title "feat(playground): seat four live calls against LocalAI's four slots"
```

PR body on the template: Summary (LocalAI's four slots, the owner's decision to use all four; the live playground can
now hold every LocalAI slot, so anything else on that server queues behind visitors), Changes (the constant and its
comment, the pool size, the two unit tests, the E2E five-call case, AGENTS.md and the runbook), Verification
(`/verify` ticked, the E2E five-call case as the test that failed first), Deployment impact (none: no new value, no
restart), Docs (AGENTS.md and `docs/deployment.md` ticked). Jason merges.

---

### Task 3: Land Renovate's GitHub Actions update

**Findings.** Renovate's dependency dashboard (issue #14) lists one update under "Pending Status Checks": the
`actions` group (`actions/download-artifact`, `actions/setup-node`, `actions/upload-artifact`), branch
`renovate/actions`. It is pending because of `minimumReleaseAge: "7 days"` in `.github/renovate.json5:16`, not
because of dashboard approval (only the Aspire group has `dependencyDashboardApproval`). It will open on its own
once the newest release is 7 days old; ticking its checkbox opens it now. Current pins:
`download-artifact@3e5f45b2…` (v8.0.1, `publish-images.yml:155`), `setup-node@8207627…` (v7.0.0,
`web-checks.yml:35`), `upload-artifact@043fb46d…` (v7.0.1, `e2e.yml:121`). The PR edits `web-checks.yml` and
`e2e.yml`, each of which names its own file in its `pull_request`
paths, so both run on the PR; the image workflow runs on `main` after the merge. The `renovate/actions` branch does
not exist on origin until Step 1 happens ("Pending Status Checks" means nothing is pushed yet).

**Files:**

- Modify (by Renovate): `.github/workflows/publish-images.yml`, `.github/workflows/web-checks.yml`,
  `.github/workflows/e2e.yml`
- Test: `actionlint` locally; the image workflow run on `main` after the merge

**Interfaces:**

- Consumes: nothing from other tasks.
- Produces: nothing other tasks rely on.

- [ ] **Step 1: Open the PR**

Jason ticks the `renovate/actions` checkbox on <https://github.com/jrmatherly/matherlynet/issues/14>, or waits for
the release-age window. Renovate opens the PR on its next run (weekly schedule, or sooner after a checkbox).

- [ ] **Step 2: Check out and read the diff**

```bash
cd /Users/jason/dev/matherlynet && git fetch origin renovate/actions && git switch renovate/actions
git diff main --stat && git diff main
```

Expected: only the three workflow files; each `uses:` line gains a new 40-hex SHA and a `# vX.Y.Z` comment that
Renovate updates together. Confirm each SHA is the tag's commit:

```bash
git diff main -- .github | grep '^+' | grep -o "uses: actions/[a-z-]*@[0-9a-f]* # v[0-9.]*" | sort -u |
while read -r _ pin _ tag; do
  ref=${pin%@*}; sha=${pin#*@}
  obj=$(gh api "repos/$ref/git/ref/tags/$tag" --jq .object.sha)
  type=$(gh api "repos/$ref/git/ref/tags/$tag" --jq .object.type)
  [ "$type" = tag ] && obj=$(gh api "repos/$ref/git/tags/$obj" --jq .object.sha)
  echo "$ref $tag pinned=$sha tag=$obj $([ "$sha" = "$obj" ] && echo OK || echo MISMATCH)"
done
```

Expected: every line ends `OK`. Only added lines (`^+`) are read, so the old pins are never checked by mistake;
`sort -u` collapses the four `setup-node` sites to one.

- [ ] **Step 3: Read the release notes for breaking input changes**

```bash
git diff main -- .github | grep '^+' | grep -o "uses: actions/[a-z-]*@[0-9a-f]* # v[0-9.]*" | sort -u |
while read -r _ pin _ tag; do gh release view "$tag" -R "${pin%@*}" --json body -q .body | head -40; done
```

Expected: no removed or renamed inputs among the ones the workflows pass: `node-version` (`setup-node`), `name`,
`path`, `retention-days` and `if-no-files-found` (`upload-artifact`, `download-artifact`). `package_json_file` belongs
to `pnpm/action-setup`, which is not in this group. If one is removed, fix the workflow in
the same PR (push to `renovate/actions`; Renovate stops rebasing a branch with human commits unless the PR's
"rebase/retry" box is ticked).

- [ ] **Step 4: Lint**

```bash
actionlint
```

Expected: no output (clean).

- [ ] **Step 5: Check the PR's own runs, merge, verify on main**

`gh pr checks <n>` must show `web-checks` and `e2e` passing on the PR (they run because the PR edits their files).
Jason merges: `gh pr merge <n> --squash --delete-branch`. Then watch the image workflow on `main` for that merge
commit (it runs because `publish-images.yml` changed):

```bash
git fetch -q origin main
run=$(gh run list --workflow publish-images.yml --branch main --commit "$(git rev-parse origin/main)" --limit 1 \
  --json databaseId -q '.[0].databaseId')
gh run watch "$run" --exit-status && gh run view "$run" --json jobs -q '.jobs[] | "\(.name) | \(.conclusion)"'
```

Expected: every job `success`. A new chart version publishes (`0.<run>.1`); nothing in it changes for the cluster,
so no deploy message is needed unless Jason wants the site on the newest image.

---

## Self-review

- Spec coverage: the three open items in the handoff each have a task; Task 2's default outcome (no change) is a
  decision the plan records rather than a gap.
- Placeholders: none; Task 1's proposal sentences are labelled as proposals for the owner, not content to commit.
- Type consistency: the only symbols named are existing ones (`LIVE.seats`, `IN_FLIGHT_MAX`, `playgroundDb`).
- Review Focus: item 1 is pinned by Task 1 Step 4, item 2 by Task 2 Steps 4 and 5, item 3 by Task 2 Step 1, item 4
  by Task 3 Step 5, item 5 by Task 3 Step 3.
- Reviewed 2026-10-12 by an independent reviewer (14 findings, 13 applied after verification against the files; the
  one rejected named `/no-comments` as nonexistent, and it is the jstack `no-comments` skill).
