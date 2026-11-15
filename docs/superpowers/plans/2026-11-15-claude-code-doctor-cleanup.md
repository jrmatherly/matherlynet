# Claude Code doctor cleanup implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In matherlynet sessions, turn off the Claude Code extensions that Jason does not use and move one block of
project guidance to on-demand loading. A session here then starts with about 8.8k fewer estimated tokens of
subagent listings, and the skill listing has room to show descriptions for the skills Jason does use.

**Architecture:** Two independent tasks, both inside this repository. Task 1 creates the git-ignored
`.claude/settings.local.json`, which overrides Jason's user settings for this project only. Task 2 edits checked-in
guidance files on a branch.

**Tech stack:** `jq`, `markdownlint-cli2`, git.

**Spec:** None. The `/doctor` run of 2026-11-15 produced the findings. The "Findings" section below records them, so
this plan stands alone.

## Global constraints

- Write nothing outside this repository. `~/.claude/settings.json`, `~/.claude.json` and everything else under
  `~/.claude` are read-only for this plan (Jason's decision, 2026-11-15).
- Read those files one key at a time with `jq`. Never print them whole. Both hold secrets in `env` and `headers`.
- The settings changes go in `.claude/settings.local.json`, never in the checked-in `.claude/settings.json`. Which
  add-ons one person leaves on is not a project rule.
- Disable, never uninstall. Deleting `.claude/settings.local.json` undoes Task 1 completely.
- Token figures are estimates (characters divided by 4). The check that counts is `/context` before and after.
- Claude Code caps the skill listing at 1% of the context window and drops the descriptions of the least-used
  skills to fit ([Skill descriptions are cut short](https://code.claude.com/docs/en/skills)). The Skills row in
  `/context` shows the size after that cap. Removing unused skills therefore brings descriptions back for the used
  ones. It lowers the Skills row only if the listing ends up under the cap.
- Repository edits follow `AGENTS.md`: 120-column Markdown, a top-level heading in every file, Edit and Write tools
  for checked-in files (the PostToolUse lint hook does not see `sed`).
- Commits are SSH-signed through 1Password. If signing fails, leave the work staged and tell Jason. Never bypass
  signing.
- Do not push. Every push needs Jason's go.

## Review focus

1. **The Skills row in `/context` does not drop, and someone reads that as a failure.** The row is capped, so it can
   stay flat while the cleanup works. Expected: the 12 skills and the 29 plugins' skills are gone and the row is not
   higher. Task 1 step 6 judges the skills half by names, and only the subagent half by tokens.
2. **A name in a list matches no installed plugin or skill.** Expected: the task stops before it writes. Task 1
   steps 2 and 3 count the names that exist and must return the full counts.
3. **The local settings file gets committed.** Expected: `git status` never shows it. Task 1 step 5 checks this.
4. **A disabled plugin's hook was doing something a session relies on.** `azure` and `browser-use` ship hooks or
   tool connections. Expected: a new session starts with no hook error. Task 1 step 6 checks this.
5. **The new path-scoped rule does not load when the figure's files are open.** Expected: reading
   `web/src/components/GatewayPath.astro` in a new session loads `gateway-figure.md`. Task 2 step 7 checks this.
6. **A reference still points at the removed "Gateway figure" section.** Expected: no file names that section.
   Task 2 step 5 greps for it.

## Findings

Scan windows: 50 sessions over 2 days (2026-11-14 to 2026-11-15) for hooks and permission denials, 1,306 sessions
over 30 days for tool-connection and subagent calls. Plugin and skill counts are lifetime totals from `~/.claude.json`.

| Finding | Evidence | Plan |
| :--- | :--- | :--- |
| Install is healthy | One native install, no npm leftovers, 4 config files parse, 29 skill frontmatter blocks parse | None |
| 10 `voltagent-*` plugins list 165 subagents | 5 lifetime uses, 1 spawn in 30 days, 8.8k est. tokens | Task 1 |
| 19 plugins unused | 0 skill uses since 2026-09-22 (redis-development: 2, last 2026-10-04), 11.6k est. tokens | Task 1 |
| 12 user skills unused | 0 lifetime uses each, 1.0k est. tokens | Task 1 |
| Skill listing over its 1% cap | About 29k est. tokens of descriptions; most entries reach the model as a bare name | Task 1 |
| "Gateway figure" notes load in every `web/` session | 30 lines, about 1.1k est. tokens | Task 2 |
| 4 tool connections idle | agent-browser, jean, mise, snippetslab: 0 calls in 30 days | Out of scope |
| `jstack:j-agent` was 13% of usage | 32 of 46 spawns ran on Opus, set in `jstack-models.md` | Out of scope |
| `web/AGENTS.md` and `AGENTS.md` carry generic or repeated lines | 14 lines, about 200 est. tokens | Out of scope |
| One pre-Bash hook took 54 to 90 s | 3 of 3 runs; it is the `pnpm check` commit gate in two other repositories | None |
| `~/dev/career-ops/AGENTS.md` is 103,465 characters | 25% of usage, 26k est. tokens per request | Out of scope |
| Auto mode is already the default | `permissions.defaultMode` is `auto` at user scope, no project override | None |
| No read-only command worth pre-approving | 41 of 46 denials were `automode-unavailable` | None |

Kept on purpose: `aspire` (this repository is an Aspire AppHost), `coderabbit` (installed 2026-11-09, too recent to
judge), the skills `coding-standards`, `hindsight-*`, `snippetslab` and `reverse-engineer-anything` (a rule, jstack
or a connected tool names each), the project skill `ship`, and the `astro-docs` and `better-auth` tool connections.

## File structure

| File | Change | Owner |
| :--- | :--- | :--- |
| `.claude/settings.local.json` | New, git-ignored: `enabledPlugins` (29 off) and `skillOverrides` (12 off) | Task 1 |
| `.claude/rules/gateway-figure.md` | New path-scoped rule | Task 2 |
| `.claude/rules/web-architecture.md` | Delete the `## Gateway figure` section | Task 2 |
| `.claude/rules/web-patterns.md` | Repoint one reference | Task 2 |
| `AGENTS.md` | Name the new rule file | Task 2 |
| `CLAUDE.md` | Name the new rule area | Task 2 |

---

### Task 1: Turn off unused plugins and skills for this project

**Files:**

- Create: `.claude/settings.local.json`

The Claude Code docs confirm both keys work from this file (checked 2026-11-15 against the
[settings reference](https://code.claude.com/docs/en/settings-reference) and the
[skills page](https://code.claude.com/docs/en/skills)):

- `enabledPlugins` has the scope "Any file" and resolves one plugin at a time. Local settings outrank project and
  user settings, so `false` here turns off a plugin that the user file turns on.
- `skillOverrides` has the scope "Any file" and covers personal and project skills. The `/skills` menu itself
  saves to `.claude/settings.local.json`.
- `skillOverrides` does not affect plugin skills. Turning off the personal `sentry-cli` skill leaves the plugin's
  `sentry-cli:sentry-cli` alone.

- [ ] **Step 1: Record the baseline**

Ask Jason to run `/context` in a new matherlynet session and note the token figures for skills and for subagents.
If the desktop app does not show `/context`, run it from `claude` in a terminal.

- [x] **Step 2: Confirm all 29 plugin keys exist and are on in the user settings**

Run these from the repository root. Steps 3 and 4 reuse `$PLUGINS` and `$SKILLS`, so run steps 2 to 4 in one shell.

```bash
PLUGINS=$(jq -c '(.[0] | map("voltagent-" + . + "@voltagent-subagents")) + (.[1] | map(. + "@claude-plugins-official"))' <<'JSON'
[["biz","core-dev","data-ai","dev-exp","domains","infra","lang","meta","qa-sec","research"],
 ["qdrant-skills","logfire","pydantic-ai","mcp-server-dev","workos","modern-web-guidance","langfuse",
  "agent-sdk-dev","superdesign","preset-cli-skills","claude-md-management","commit-commands","code-simplifier",
  "session-report","azure","redis-development","rust-analyzer-lsp","lua-lsp","browser-use"]]
JSON
)
jq --argjson names "$PLUGINS" '[$names[] as $n | .enabledPlugins[$n] | select(. == true)] | length' ~/.claude/settings.json
```

Expected: `29`. Any other number means a key is missing or already off for every project. Stop and report it.
`langfuse` is the skills plugin. `langfuse-observability` is a different plugin and stays on.

- [x] **Step 3: Confirm all 12 skill directories exist**

```bash
SKILLS='["doc-coauthoring","email-and-password-best-practices","find-skills","internal-comms","mcp-builder",
"organization-best-practices","scrapling-official","supabase-prompts","theme-factory",
"two-factor-authentication-best-practices","web-artifacts-builder","sentry-cli"]'
jq -r '.[]' <<<"$SKILLS" | while read -r s; do [ -f "$HOME/.claude/skills/$s/SKILL.md" ] && echo ok; done \
  | wc -l | tr -d ' '
```

Expected: `12`. Each name is both the directory name and the `name` in that skill's frontmatter.

- [x] **Step 4: Write the local settings file**

```bash
f=.claude/settings.local.json
[ -e "$f" ] || echo '{}' > "$f"
tmp=$(mktemp)
jq --argjson p "$PLUGINS" --argjson s "$SKILLS" '
  .enabledPlugins = ((.enabledPlugins // {}) + ($p | map({(.): false}) | add))
  | .skillOverrides = ((.skillOverrides // {}) + ($s | map({(.): "off"}) | add))' "$f" > "$tmp" && mv "$tmp" "$f"
```

The command keeps any key the file already has and sets values, so a second run changes nothing.

- [x] **Step 5: Check the file**

```bash
jq -c '[(.enabledPlugins | map(select(. == false)) | length), (.skillOverrides | map(select(. == "off")) | length)]' \
  .claude/settings.local.json
git status --short .claude/
```

Expected: `[29,12]`, then no output from `git status`.

- [ ] **Step 6: Confirm in a new session**

Ask Jason to open a new matherlynet session and run `/context`. Expected:

- The session starts with no hook error.
- The subagent figure drops by roughly 8.8k tokens, and no `voltagent-` name appears in the subagent list.
- The skills figure is not higher than the baseline, and no `azure:`, `qdrant:` or `logfire:` skill is listed.
- `sentry-cli:sentry-cli` (the plugin's copy) is still listed. The bare `sentry-cli` and the other 11 skills are
  gone from the list and from `/` autocomplete.

If any of the 12 skills is still listed, report it with the Claude Code version. The docs say it should be hidden.

Undo: delete `.claude/settings.local.json`, or set one key back to `true`.

- [ ] **Step 7: Decide whether the skill listing needs more room**

Ask Jason to run `/skill-doctor` in a terminal session in this repository (Claude Code 2.1.252 or later). It reports
what each remaining skill costs and which ones were never invoked. If used skills still show without a
description, Jason picks one of these, both in the same `.claude/settings.local.json`:

- Set more low-use personal skills to `"name-only"` in `skillOverrides`. The skill stays invocable and its
  description leaves the listing. Plugin skills cannot be set this way.
- Set `"skillListingBudgetFraction": 0.02`. The listing may then use 2% of the context window, which costs up to
  another 1%.

This step changes nothing unless Jason chooses.

### Task 2: Move the gateway figure notes to their own path-scoped rule

**Files:**

- Create: `.claude/rules/gateway-figure.md`
- Modify: `.claude/rules/web-architecture.md:145-175`
- Modify: `.claude/rules/web-patterns.md:80-81`
- Modify: `AGENTS.md:5-6`
- Modify: `CLAUDE.md:8`

- [x] **Step 1: Branch**

```bash
git switch -c chore/gateway-figure-rule
```

- [x] **Step 2: Create `.claude/rules/gateway-figure.md`**

Start the file with this frontmatter and heading:

```markdown
---
paths:
  - "web/src/components/GatewayPath.astro"
  - "web/src/components/GatewayLabel.astro"
  - "web/src/lib/gateway-path.ts"
  - "web/src/lib/gateway-map.ts"
  - "web/src/data/gateway.ts"
  - "web/tests/gateway-path.test.ts"
  - "web/tests/home.test.ts"
  - "web/tests/__snapshots__/gateway-path-*.svg"
---

# Home gateway figure
```

Below the heading, paste the two bullets of the `## Gateway figure` section of `web-architecture.md` (lines 148 to
175) with no change to their wording.

- [x] **Step 3: Delete the section from `web-architecture.md`**

Remove the `## Gateway figure` heading, its two bullets and the blank line before the heading. The file ends with
the closing fence of the file map.

- [x] **Step 4: Repoint the three references**

In `web-patterns.md`, the bullet that begins "The home gateway figure (`GatewayPath.astro`)" ends with:

```text
its engine and its SVG snapshots: see `.claude/rules/gateway-figure.md`.
```

In `AGENTS.md`, add `gateway-figure.md` to the list of rule files in the opening paragraph, in alphabetical order
(after `database.md`). That list is how tools other than Claude Code find the rule, because they do not load rules
by path.

In `CLAUDE.md`, add "gateway figure" to the list of areas in the "Area rules load by path" bullet, after
"database".

- [x] **Step 5: Check**

```bash
markdownlint-cli2 .claude/rules/gateway-figure.md .claude/rules/web-architecture.md .claude/rules/web-patterns.md AGENTS.md
git grep -n '"Gateway figure" section' -- . ':!docs/superpowers' | wc -l | tr -d ' '
grep -c "toMatchFileSnapshot" .claude/rules/gateway-figure.md .claude/rules/web-architecture.md
git ls-files web/src/components/GatewayPath.astro web/src/components/GatewayLabel.astro web/src/lib/gateway-path.ts \
  web/src/lib/gateway-map.ts web/src/data/gateway.ts web/tests/gateway-path.test.ts web/tests/home.test.ts \
  | wc -l | tr -d ' '
grep -c "gateway-figure.md" AGENTS.md .claude/rules/web-patterns.md
grep -c "gateway figure" CLAUDE.md
```

Expected: lint reports 0 errors, then `0`, then `.claude/rules/gateway-figure.md:1` and
`.claude/rules/web-architecture.md:0`, then `7`, then `AGENTS.md:1` and `.claude/rules/web-patterns.md:1`, then `1`.

`web/README.md` and `AGENTS.md` line 50 name `web-architecture.md` as the file map. Both stay true.

- [x] **Step 6: Commit**

```bash
git add .claude/rules/gateway-figure.md .claude/rules/web-architecture.md .claude/rules/web-patterns.md AGENTS.md \
  CLAUDE.md
git commit -m "docs: load the gateway figure notes only with the figure's files"
```

- [ ] **Step 7: Confirm the rule loads on demand**

In a new session on this branch, read `web/src/lib/site.ts` and run `/context`. Expected: `gateway-figure.md` is
not among the memory files. Then read `web/src/components/GatewayPath.astro` and run `/context` again. Expected:
`gateway-figure.md` is listed.

Stop here and report. Jason decides whether to open a pull request.

---

## Out of scope

Each item below needs a file outside this repository, so this plan leaves it alone.

- **The same cleanup for every project.** The unused plugins and skills stay on everywhere except matherlynet. The
  one place that turns them off for all projects is `~/.claude/settings.json`.
- **Four idle tool connections** (agent-browser, jean, mise, snippetslab). They are user-level connections. A
  project settings file can turn off only the connections that `.mcp.json` defines. The per-project switch for
  user-level ones lives in `~/.claude.json`.
- **A cheaper model for routine `j-agent` work.** The choice is in
  `~/dev/dotfiles/tilde/.claude/rules/jstack-models.md`, which says the Opus setting for code was made by hand. The
  candidates are the `swarm workers` and `bug-fix` lines.
- **`~/dev/career-ops/AGENTS.md`.** At 103,465 characters it is the largest single cost that `/usage` flagged. It
  needs its own plan in that repository.

These need no change at all.

- **Trims to `AGENTS.md` and `web/AGENTS.md`.** The `/doctor` run proposed cutting the Astro documentation links
  from `web/CLAUDE.md` and three bullets from `AGENTS.md`. `web/CLAUDE.md` is a symlink to `web/AGENTS.md`, and both
  `AGENTS.md` files are the guide for every agent tool, not only Claude Code. Other tools get no `/verify` skill,
  no lint hook and no `astro-docs` connection, so two of the three bullets and the links repeat nothing for them.
  The one bullet that repeats text inside `AGENTS.md` itself is about 25 est. tokens, which does not pay for a
  change.
- **The slow pre-Bash hook.** Its status text is "Running pnpm check before the commit". The project settings of
  `~/dev/claude-multipass` and `~/dev/dotfiles` define it, and it runs that check before a commit by design.
  matherlynet has no such hook.
- **`ccd_turn` (12% of usage).** The desktop app's built-in task list and wrap-up box. No setting turns it off.
- **The jstack plugin (26% of usage).** It ran in 277 of 1,306 sessions. The cost is use.
- **The five narrowly scoped rules** (`apphost.md`, `database.md`, `integrations.md`, `runtime.md`,
  `workflows.md`). The `/doctor` run did not read them for derivable content.
