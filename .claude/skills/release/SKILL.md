---
name: release
description: Cuts a matherlynet release, a signed v<chart version> tag plus a GitHub Release, on a commit CI has already published. Runs read-only preflight checks, writes the notes, then signs, pushes and verifies. Use only when the user explicitly asks to release, tag or cut a version in the current turn, or invokes /release. It doesn't publish images or charts (CI does) and doesn't deploy (the home-cluster session does).
argument-hint: "[commit]"
disable-model-invocation: true
allowed-tools: Bash(${CLAUDE_SKILL_DIR}/scripts/preflight.sh *)
---

# Release

A release names a chart CI already built. A pushed tag can't be deleted or moved (SECURITY.md), so nothing gets pushed
until preflight passes.

1. **Approval.** Tag only if the user asked in this turn. Approval from an earlier release doesn't count.
2. **Preflight.** Run `${CLAUDE_SKILL_DIR}/scripts/preflight.sh $ARGUMENTS`. With no argument it takes the newest
   commit on `main` with a successful publish run; say if newer commits exist. Stop on any FAIL: show it and fix the
   cause. Never work around one.
3. **Notes.** Write them to a file in the scratchpad from preflight's output and the commits' PRs, in the format below.
   Say what changed for someone running the site, and check each claim against the diff.
4. **Tag, push, publish, verify.** Run the commands preflight printed, in order, changing only the notes file path, and
   stop at any failure. If an earlier run stopped partway, preflight prints only what's left. A 1Password prompt appears
   when tagging; if signing fails, ask the user. Never bypass signing. Report the final `--recheck`, which checks the
   signature through GitHub: `git tag -v` fails here because this machine has no `gpg.ssh.allowedSignersFile`.
5. **Deploy.** Not part of a release. Only if the user asks, send the home-cluster session the chart, digest, what
   changed and the rollout checks, and tell it that it does the deploy. Never touch the cluster from here.

## Notes format

The opening, heading, upgrade sentence and last line come from preflight's output.

```markdown
<Opening> <One sentence on what this release is.> <Migrations and chart values: say there are none, or name them. If the
chart changed only in its version, image pin and SENTRY_RELEASE, say so.>

<Heading>

- **<Area>.** <What changed and why it matters.>

## Upgrading

<Upgrade> <New values, migrations or manual steps, or "No new values and no migration.">

<Last line>
```

## Gotchas

- Version numbers skip: they follow the run number, so 0.48.1 doesn't exist. Re-running only another job raises the run
  attempt without a new chart, so take the version from preflight.
- Notes can change after publishing (`gh release edit`). A bad pushed tag gets a new release, not a replacement.
