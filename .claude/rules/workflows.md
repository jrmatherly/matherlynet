---
paths:
  - ".github/workflows/**"
---

# GitHub Actions workflows

- Pin every action to its full commit SHA with the version in a comment:
  `uses: actions/checkout@<40-char-sha> # v7.0.1`. Resolve with
  `gh api repos/<owner>/<repo>/git/ref/tags/<tag>` (dereference annotated tags via `git/tags/<sha>`).
- Keep: `concurrency` (`${{ github.workflow }}-${{ github.ref }}`, `cancel-in-progress: true`), top-level
  `permissions: {}` with per-job grants, `persist-credentials: false` on checkout, `timeout-minutes`, and
  emoji-prefixed step names. Workflows also used via `workflow_call` suffix their group with their own name: a
  called workflow sees the caller's `github.workflow`, so an identical group would cancel the caller.
- `publish-images.yml` calls `web-checks.yml` and `e2e.yml` (`needs: [checks, e2e]`) before pushing; those two run
  on their own only for pull requests. The Aspire CLI is a pinned, sha512-checked tarball: bump version and hash
  together (hash from the release's `.sha512` asset).
- `aspire do push` must stay quoted as `aspire 'do' push` (shellcheck SC1010 reads `do` as a keyword).
- Validate with `actionlint .github/workflows/<file>.yml` after every edit.
- Image tags: CI sets `IMAGE_TAG=${{ github.sha }}`, consumed by `withRemoteImageTag` in `apphost.mts`.
