---
paths:
  - ".github/workflows/**"
  - "scripts/check-chart.sh"
  - "scripts/smoke-image.sh"
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
  on their own only for pull requests or manual dispatch, so they are in its `paths:` filter. After `push`, the
  `chart` job (main only, version `0.<run>.<attempt>`) and the `sourcemaps` job run in parallel.
- The Aspire CLI is a pinned, sha512-checked tarball in `e2e.yml`, `publish-images.yml` and `repo-checks.yml`
  (`ASPIRE_VERSION`, `ASPIRE_SHA512`): bump version and hash together in all three (hash from the release's `.sha512`
  asset).
- E2E uses the dev server. `web-checks.yml`'s "Smoke-test the production server" step runs `web/server.mjs` alone,
  without a database (keep it in step with the probes and origin check); `e2e.yml`'s "Smoke-test the production
  image" (`scripts/smoke-image.sh`) runs the image's real entry, `start.mjs`, against Postgres.
- In `run:` scripts, assign command output to a variable before writing it to `$GITHUB_OUTPUT`: a failing `$(…)`
  inside `echo` doesn't fail the step.
- `aspire do push` must stay quoted as `aspire 'do' push` (shellcheck SC1010 reads `do` as a keyword).
- Validate with `actionlint .github/workflows/<file>.yml` after every edit.
- Image tags: CI sets `IMAGE_TAG=${{ github.sha }}`, consumed by `withRemoteImageTag` in `apphost.mts`.
- The chart steps use the runner image's own `helm` (3.x; a local helm 4 also works) and `yq`, with no setup
  action. Chart checks live in `scripts/check-chart.sh`, shared by `e2e.yml` and `publish-images.yml`. Rehearse
  changes locally: `DEPLOY_TARGET=k8s aspire publish`, the script, then the `chart` job's own step text
  (`yq -r '.jobs.chart.steps[1].run'`) with `ghcr.io` swapped for a throwaway `registry:2` container and
  `--plain-http` added to the helm registry commands.
- `run:` steps use `bash -e` with no pipefail unless they set it (`shell: bash`, or `set -o pipefail`), so a
  pipeline's status is its last command's. When the left side must not fail silently, write to a file and grep that.
- CI pins actions to commit SHAs, cancels superseded runs, and tags images with the commit SHA.
  Images carry a build provenance attestation: `gh attestation verify oci://ghcr.io/jrmatherly/matherlynet/web:<sha>
  -R jrmatherly/matherlynet`.
- `publish-images.yml`'s `chart` job pushes the Helm chart to
  `oci://ghcr.io/jrmatherly/matherlynet/charts/matherlynet` as `0.<run number>.<run attempt>` (`appVersion` =
  commit SHA), from `main` only (a manual run on another branch must not publish a higher version). A re-run of that
  job gets a new version, and it refuses to replace one that exists. The `push` job generates the chart and runs
  `scripts/check-chart.sh` (also run on PRs by `e2e.yml`) before the image push, so a chart that fails its checks
  publishes nothing; a failed chart push can't skip the source maps. CI writes the pushed image (`web@<digest>`)
  into `parameters.web.web_image` and renders the packaged chart to confirm it: `aspire publish` leaves the value
  as `web:latest`. The chart name comes from `withChartName` in `apphost.mts`; the chart is not attested.
  A release is a signed `v<chart version>` tag (e.g. `v0.46.1`) on the commit that chart was built from, with a GitHub
  Release, cut by hand with `/release` (no workflow creates it); fixes land on `main` only.
- The image workflow runs only when the image, the chart or their checks can change (`web/**` minus docs, AppHost
  files, root `package*.json`, `scripts/check-chart.sh` and `smoke-image.sh`, the workflow itself and the
  `web-checks.yml` and `e2e.yml` it calls);
  `workflow_dispatch` bypasses the filter. `paths-ignore` can't take `!` exceptions, so it is an include list.
