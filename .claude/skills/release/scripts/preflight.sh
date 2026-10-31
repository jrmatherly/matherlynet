#!/bin/bash
#
# Read-only checks before cutting a release. Prints PASS/FAIL per check, then what the notes need, and exits non-zero
# if any check failed. Creates nothing.
# Usage: preflight.sh [--recheck] [commit]
#   commit     default: the newest commit on main with a successful publish run
#   --recheck  re-verify a commit that already has its tag

set -uo pipefail
cd "${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}" || exit 1

REPO=jrmatherly/matherlynet
IMAGE=ghcr.io/$REPO/web
CHART=oci://ghcr.io/$REPO/charts/matherlynet

recheck=0
if [ "${1:-}" = "--recheck" ]; then recheck=1; shift; fi

failed=0
pass() { printf 'PASS  %s\n' "$1"; }
fail() { printf 'FAIL  %s\n' "$1"; failed=1; }
# A check that can't continue without its answer.
stop() { fail "$1"; exit 1; }

for tool in gh git crane helm; do
  command -v "$tool" > /dev/null || stop "command -v $tool found nothing"
done

git fetch -q --tags origin main || stop "git fetch origin (a local tag that differs from origin's also fails this)"

if [ $# -gt 0 ]; then
  sha=$(git rev-parse --verify -q "$1^{commit}") || stop "$1 is not a commit here"
else
  sha=$(gh run list -R "$REPO" --workflow publish-images.yml --branch main --status success --limit 1 \
    --json headSha --jq '.[0].headSha // ""')
  [ -n "$sha" ] || stop "no successful publish run on main"
fi
short=${sha:0:7}

git merge-base --is-ancestor "$sha" origin/main && pass "$short is on origin/main" || fail "$short is not on origin/main"

[ "$(gh api "repos/$REPO/commits/$sha" --jq .commit.verification.verified)" = true ] \
  && pass "commit signature verified by GitHub" || fail "commit signature not verified by GitHub"

runs=$(gh run list -R "$REPO" --workflow publish-images.yml --branch main --commit "$sha" --status success --limit 1 \
  --json databaseId --jq length)
[ "$runs" -gt 0 ] && pass "publish run succeeded" \
  || stop "no successful publish run for $short (a docs-only commit starts none: release the commit its chart built from)"

# appVersion, not the run: re-running only another job raises the run attempt without a new chart (run 47 is attempt 2,
# chart 0.47.1).
chart=""
for version in $(crane ls "${CHART#oci://}" | sort -rV); do
  if [ "$(helm show chart "$CHART" --version "$version" 2> /dev/null | sed -n 's/^appVersion: //p')" = "$sha" ]; then
    chart=$version
    break
  fi
done
[ -n "$chart" ] && pass "chart $chart has appVersion $short" || stop "no chart has appVersion $short"
tag=v$chart

# The peeled ref: an annotated tag's own object isn't the commit.
remote=$(git ls-remote origin "refs/tags/$tag^{}") || stop "git ls-remote origin"
remote=${remote%%$'\t'*}
local_sha=$(git rev-parse -q --verify "refs/tags/$tag^{commit}")
releases=$(gh release list -R "$REPO" --limit 100 --json tagName --jq '.[].tagName') || stop "gh release list"
released=0
grep -qxF "$tag" <<< "$releases" && released=1

next=tag
if [ $recheck = 1 ]; then
  [ "$remote" = "$sha" ] && pass "$tag on origin points at $short" || fail "$tag on origin does not point at $short"
  [ $released = 1 ] && pass "GitHub Release $tag exists" || fail "GitHub Release $tag does not exist"
  # GitHub's check, because this machine has no gpg.ssh.allowedSignersFile for git tag -v.
  tag_object=$(gh api "repos/$REPO/git/refs/tags/$tag" --jq .object.sha 2> /dev/null)
  [ "$(gh api "repos/$REPO/git/tags/$tag_object" --jq .verification.verified 2> /dev/null)" = true ] \
    && pass "tag signature verified by GitHub" || fail "tag signature not verified by GitHub"
elif [ -n "$remote" ] && [ "$remote" != "$sha" ]; then
  fail "$tag on origin points at ${remote:0:7}, not $short, and tags can't be moved or deleted"
elif [ -n "$remote" ] && [ $released = 1 ]; then
  fail "$tag is already released"
elif [ -n "$remote" ]; then
  pass "$tag is pushed with no GitHub Release: continuing from there"
  next=release
elif [ "$local_sha" = "$sha" ]; then
  pass "$tag is local only: continuing from there"
  next=push
elif [ -n "$local_sha" ]; then
  fail "local $tag points at ${local_sha:0:7}, not $short, and isn't pushed: git tag -d $tag"
elif [ $released = 1 ]; then
  fail "GitHub Release $tag exists with no tag on origin"
else
  pass "$tag is free"
fi

newest=$(git tag -l 'v*' | sort -V | tail -1)
previous=$(git tag -l 'v*' | sort -V | awk -v tag="$tag" '$0 == tag { exit } { last = $0 } END { print last }')
if [ $recheck = 0 ] && [ "$(printf '%s\n%s\n' "$newest" "$tag" | sort -V | tail -1)" != "$tag" ]; then
  fail "$newest is newer than $tag"
fi
if [ -z "$previous" ]; then
  stop "no release before $tag"
fi
git merge-base --is-ancestor "$previous^{commit}" "$sha" && pass "$previous is an ancestor" \
  || fail "$previous is not an ancestor of $short"

digest=$(crane digest "$IMAGE:$sha" 2> /dev/null) && pass "image tag resolves to $digest" \
  || stop "no image tagged $sha"

values=$(helm show values "$CHART" --version "$chart" 2> /dev/null)
grep -qF "web_image: \"$IMAGE@$digest\"" <<< "$values" && pass "chart pins that digest" \
  || fail "chart does not pin $digest"
grep -qF "SENTRY_RELEASE: \"$sha\"" <<< "$values" && pass "chart's SENTRY_RELEASE is the commit" \
  || fail "chart's SENTRY_RELEASE is not $sha"

gh attestation verify "oci://$IMAGE:$sha" -R "$REPO" > /dev/null 2>&1 && pass "image attestation verifies" \
  || fail "image attestation does not verify"

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
mkdir "$work/old" "$work/new"
helm pull "$CHART" --version "${previous#v}" --untar -d "$work/old" > /dev/null 2>&1 \
  || stop "can't pull chart ${previous#v} to compare"
helm pull "$CHART" --version "$chart" --untar -d "$work/new" > /dev/null 2>&1 || stop "can't pull chart $chart to compare"
chart_diff=$(diff -r "$work/old" "$work/new" | grep -E '^([<>]|Only in )' | sed "s|$work/||" \
  | grep -vE '^[<>] (version|appVersion):|^[<>] +(web_image|SENTRY_RELEASE):')

printf '\nFor the notes\n'
printf '  %s commits on origin/main after it\n' "$(git rev-list --count "$sha..origin/main")"
printf '  Opening: Helm chart `%s` **%s**, image `%s:%s` (pinned by digest `%s…` in the chart).\n' \
  "$CHART" "$chart" "$IMAGE" "$sha" "${digest:0:15}"
printf '  Heading: ## Changes since %s\n' "${previous#v}"
printf '  Upgrade: Bump the HelmRelease to chart `%s`.\n' "$chart"
printf '  Last line: Verify the image: `gh attestation verify oci://%s:%s -R %s`\n' "$IMAGE" "$sha" "$REPO"
printf '\nCommits since %s\n' "$previous"
git log --format='  %h %s' "$previous..$sha"
printf '\nFiles changed\n'
git diff --stat=100 "$previous" "$sha" | sed 's/^ */  /'
printf '\nMigrations added\n'
git diff --name-only --diff-filter=A "$previous" "$sha" -- 'web/drizzle/*.sql' | sed 's/^/  /'
printf '\nChart changes beyond version, appVersion, image pin and SENTRY_RELEASE\n'
if [ -n "$chart_diff" ]; then printf '%s\n' "$chart_diff" | sed 's/^/  /'; else printf '  none\n'; fi

if [ $failed = 1 ]; then
  printf '\nNot ready: fix each FAIL above.\n'
  exit 1
fi
printf '\nReady.\n'
[ $recheck = 1 ] && exit 0

printf '\nCommands, in order (put the notes file in the last one)\n'
[ $next = tag ] && printf '  git tag -s %s %s -m "%s: chart %s, image %s"\n' "$tag" "$sha" "$tag" "$chart" "$short"
[ $next != release ] && printf "  git cat-file -p %s | grep -q 'BEGIN SSH SIGNATURE'\n  git push origin refs/tags/%s\n" "$tag" "$tag"
printf '  gh release create %s --verify-tag --latest --title "%s" --notes-file <notes file>\n' "$tag" "$chart"
printf '  %s --recheck %s\n' "$0" "$sha"
