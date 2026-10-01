---
name: ship
description: Pushes the current branch to GitHub, watches every workflow run for the pushed commit, and reports the outcome (conclusions, Sentry release and source-map upload, image attestation). Use only when the user explicitly asks to push or ship in the current turn, or invokes /ship.
disable-model-invocation: true
---

# Ship

Push, then watch CI until it finishes and report what happened.

1. **Approval.** Push only if the user asked for it in this turn ("push", "ship", "/ship"). Approval from an
   earlier turn or another task doesn't count. Run `/verify` first if there are commits since the last passing
   run.
2. **Push.** `git push` (set upstream with `git push -u origin <branch>` on a new branch). Note the SHA:
   `git rev-parse HEAD`.
3. **Find the runs.** Wait about 10 s, then `gh run list --commit <sha> --json databaseId,name,status,conclusion`.
   Path filters mean not every workflow runs for every push; say which ones started.
4. **Watch.** `gh run watch <id> --exit-status` for each run (they run in parallel; watch the longest, then check
   the rest with `gh run view <id>`). `publish-images` runs web-checks and e2e in parallel, then push, then sourcemaps.
5. **Report** a table: workflow, job, conclusion, duration. For `publish-images` also include:
   - From the `🗺️ Upload source maps to Sentry` job log (`gh run view <id> --log --job <job id>`): the
     `Release Created` and `Files uploaded` lines, or the "SENTRY_AUTH_TOKEN not set" notice.
   - `gh attestation verify oci://ghcr.io/jrmatherly/matherlynet/web:<sha> -R jrmatherly/matherlynet`: pass or fail.
6. **Transient failures.** Rerun a failed job once (`gh run rerun <id> --failed`) only for a known transient: the
   Aspire CLI or a GitHub release download failing, or GHCR answering `unknown blob` / 5xx. Say that you reran it
   and why. Any other failure: show the failing step's log excerpt and stop; don't rerun to make it pass.

## Gotchas

- `gh run list` right after a push can be empty: GitHub needs a few seconds to queue runs.
- A pushed docs-only change may start no workflow at all; that's expected, not a failure.
- Never push to `main` from a feature branch's session without the user saying so; merging is a separate decision.
