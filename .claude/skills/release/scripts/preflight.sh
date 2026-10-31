#!/bin/bash
#
# Checks before cutting a release. Prints PASS/FAIL per check, then what the notes need and the commands to run, and
# exits non-zero if any check failed. Creates no tag or release and pushes nothing.
# Usage: preflight.sh [--recheck] [commit]
#   commit     default: the newest commit on main with a successful publish run
#   --recheck  re-verify a commit that already has its tag

set -uo pipefail
cd "${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}" || exit 1

REPO=jrmatherly/matherlynet
IMAGE=ghcr.io/$REPO/web
CHART=oci://ghcr.io/$REPO/charts/matherlynet

failed=0
pass() { printf 'PASS  %s\n' "$1"; }
fail() { printf 'FAIL  %s\n' "$1"; failed=1; }
# A check that can't continue without its answer.
stop() { fail "$1"; exit 1; }

recheck=0
commit=""
for arg in "$@"; do
  case $arg in
    --recheck) recheck=1 ;;
    -*) stop "unknown option $arg" ;;
    *) [ -z "$commit" ] && commit=$arg || stop "more than one commit given" ;;
  esac
done

for tool in gh git crane helm; do
  command -v "$tool" > /dev/null || stop "command -v $tool found nothing"
done

git fetch -q --tags origin main || stop "git fetch origin (a local tag that differs from origin's also fails this)"

if [ -n "$commit" ]; then
  sha=$(git rev-parse --verify -q "$commit^{commit}") || stop "$commit is not a commit here"
else
  sha=$(gh run list -R "$REPO" --workflow publish-images.yml --branch main --status success --limit 1 \
    --json headSha --jq '.[0].headSha // ""') || stop "gh run list"
  [ -n "$sha" ] || stop "no successful publish run on main"
fi
short=${sha:0:7}

git merge-base --is-ancestor "$sha" origin/main && pass "$short is on origin/main" || fail "$short is not on origin/main"
after=$(git rev-list --count "$sha..origin/main") || stop "git rev-list $sha..origin/main"

[ "$(gh api "repos/$REPO/commits/$sha" --jq .commit.verification.verified)" = true ] \
  && pass "commit signature verified by GitHub" || fail "commit signature not verified by GitHub"

runs=$(gh run list -R "$REPO" --workflow publish-images.yml --branch main --commit "$sha" --status success --limit 1 \
  --json databaseId --jq length) || stop "gh run list"
[ "$runs" -gt 0 ] && pass "publish run succeeded" \
  || stop "no successful publish run for $short: the path filter skips commits that can't change the image or chart"

# appVersion, not the run: re-running only another job raises the run attempt without a new chart (run 47 is attempt 2,
# chart 0.47.1). An error stops here: skipping that version could pick an older chart of the same commit.
versions=$(crane ls "${CHART#oci://}") || stop "crane ls ${CHART#oci://}"
chart=""
for version in $(sort -rV <<< "$versions"); do
  metadata=$(helm show chart "$CHART" --version "$version" 2> /dev/null) || stop "helm show chart --version $version"
  if [ "$(sed -n 's/^appVersion: //p' <<< "$metadata")" = "$sha" ]; then
    chart=$version
    break
  fi
done
[ -n "$chart" ] && pass "chart $chart has appVersion $short" || stop "no chart has appVersion $short"
tag=v$chart

# Both refs: the peeled one, listed last, is the commit of an annotated tag; a lightweight tag has only the plain one.
remote=$(git ls-remote origin "refs/tags/$tag" "refs/tags/$tag^{}") || stop "git ls-remote origin"
remote=$(tail -1 <<< "$remote")
remote=${remote%%$'\t'*}
local_sha=$(git rev-parse -q --verify "refs/tags/$tag^{commit}")
releases=$(gh release list -R "$REPO" --limit 100 --exclude-drafts --json tagName --jq '.[].tagName') \
  || stop "gh release list"
released=0
grep -qxF "$tag" <<< "$releases" && released=1

# GitHub's check, so it doesn't depend on a local allowed-signers file.
tag_verified() {
  local object
  object=$(gh api "repos/$REPO/git/refs/tags/$tag" --jq .object.sha 2> /dev/null)
  [ "$(gh api "repos/$REPO/git/tags/$object" --jq .verification.verified 2> /dev/null)" = true ]
}

next=tag
if [ $recheck = 1 ]; then
  [ "$remote" = "$sha" ] && pass "$tag on origin points at $short" || fail "$tag on origin does not point at $short"
  [ $released = 1 ] && pass "GitHub Release $tag exists" || fail "GitHub Release $tag does not exist"
  tag_verified && pass "tag signature verified by GitHub" || fail "tag signature not verified by GitHub"
elif [ -n "$remote" ] && [ "$remote" != "$sha" ]; then
  fail "$tag on origin points at ${remote:0:7}, not $short, and tags can't be deleted or force-updated"
elif [ -n "$local_sha" ] && [ "$(git cat-file -t "refs/tags/$tag")" != tag ]; then
  fail "$tag is a lightweight tag, and a release needs a signed annotated one (git tag -d if it isn't on origin)"
elif [ -n "$remote" ] && [ $released = 1 ]; then
  fail "$tag is already released, so there is nothing new to release ($after commits on origin/main after it)"
elif [ -n "$remote" ] && ! tag_verified; then
  fail "$tag is pushed, but GitHub doesn't verify its signature"
elif [ -n "$remote" ]; then
  pass "$tag is pushed with no GitHub Release: continuing from there"
  next=release
elif [ "$local_sha" = "$sha" ] && ! git cat-file tag "$tag" | grep -q '^-----BEGIN SSH SIGNATURE-----$'; then
  fail "local $tag has no SSH signature: git tag -d $tag"
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

# From published releases, not local tags: an abandoned tag as the baseline would leave changes out of the notes.
sorted=$(grep '^v' <<< "$releases" | sort -V)
newest=$(tail -1 <<< "$sorted")
previous=$(awk -v tag="$tag" '$0 == tag { exit } { last = $0 } END { print last }' <<< "$sorted")
if [ $recheck = 0 ] && [ "$(printf '%s\n%s\n' "$newest" "$tag" | sort -V | tail -1)" != "$tag" ]; then
  fail "$newest is newer than $tag"
fi
if [ -z "$previous" ]; then
  stop "no release before $tag"
fi
git merge-base --is-ancestor "$previous^{commit}" "$sha" && pass "$previous is an ancestor" \
  || fail "$previous is not an ancestor of $short"

digest=$(crane digest "$IMAGE:$sha" 2> /dev/null) && pass "image tag resolves to $digest" \
  || stop "crane digest $IMAGE:$sha (no such image, or the registry failed)"

values=$(helm show values "$CHART" --version "$chart" 2> /dev/null) || stop "helm show values --version $chart"
grep -qF "web_image: \"$IMAGE@$digest\"" <<< "$values" && pass "chart pins that digest" \
  || fail "chart does not pin $digest"
grep -qF "SENTRY_RELEASE: \"$sha\"" <<< "$values" && pass "chart's SENTRY_RELEASE is the commit" \
  || fail "chart's SENTRY_RELEASE is not $sha"

gh attestation verify "oci://$IMAGE@$digest" -R "$REPO" --source-ref refs/heads/main --source-digest "$sha" \
  --signer-workflow "$REPO/.github/workflows/publish-images.yml" > /dev/null 2>&1 \
  && pass "attestation ties the image to $short on main" || fail "attestation does not tie the image to $short on main"

work=$(mktemp -d) || stop "mktemp"
trap 'rm -rf "$work"' EXIT
mkdir "$work/old" "$work/new"
helm pull "$CHART" --version "${previous#v}" --untar -d "$work/old" > /dev/null 2>&1 \
  || stop "can't pull chart ${previous#v} to compare"
helm pull "$CHART" --version "$chart" --untar -d "$work/new" > /dev/null 2>&1 || stop "can't pull chart $chart to compare"
# Only these lines are expected to change, and only in these two files, so a template or binary change still shows.
for side in old new; do
  grep -vE '^(version|appVersion):' "$work/$side"/*/Chart.yaml > "$work/filtered" \
    && mv "$work/filtered" "$work/$side"/*/Chart.yaml || stop "can't read the $side chart's Chart.yaml"
  grep -vE '^ +(web_image|SENTRY_RELEASE):' "$work/$side"/*/values.yaml > "$work/filtered" \
    && mv "$work/filtered" "$work/$side"/*/values.yaml || stop "can't read the $side chart's values.yaml"
done
chart_diff=$(diff -r "$work/old" "$work/new")
[ $? -le 1 ] || stop "diff of the two charts failed"
chart_diff=${chart_diff//$work\//}

commits=$(git log --format='  %h %s' "$previous..$sha") || stop "git log $previous..$sha"
files=$(git diff --stat=100 "$previous" "$sha") || stop "git diff $previous $sha"
migrations=$(git diff --name-only --diff-filter=A "$previous" "$sha" -- 'web/drizzle/*.sql') \
  || stop "git diff $previous $sha -- web/drizzle"

printf '\nFor the notes\n'
printf '  %s commits on origin/main after it\n' "$after"
printf '  Opening: Helm chart `%s` **%s**, image `%s:%s` (pinned by digest `%s…` in the chart).\n' \
  "$CHART" "$chart" "$IMAGE" "$sha" "${digest:0:15}"
printf '  Heading: ## Changes since %s\n' "${previous#v}"
printf '  Upgrade: Bump the HelmRelease to chart `%s`.\n' "$chart"
printf '  Last line: Verify the image: `gh attestation verify oci://%s:%s -R %s`\n' "$IMAGE" "$sha" "$REPO"
printf '\nCommits since %s\n%s\n' "$previous" "$commits"
printf '\nFiles changed\n'
sed 's/^ */  /' <<< "$files"
printf '\nMigrations added\n'
if [ -n "$migrations" ]; then sed 's/^/  /' <<< "$migrations"; else printf '  none\n'; fi
printf '\nChart changes beyond version, appVersion, image pin and SENTRY_RELEASE\n'
if [ -n "$chart_diff" ]; then sed 's/^/  /' <<< "$chart_diff"; else printf '  none\n'; fi

if [ $failed = 1 ]; then
  printf '\nNot ready: fix each FAIL above.\n'
  exit 1
fi
printf '\nReady.\n'
[ $recheck = 1 ] && exit 0

printf '\nCommands, in order (fill in <notes file>)\n'
[ $next = tag ] && printf '  git tag -s %s %s -m "%s: chart %s, image %s"\n' "$tag" "$sha" "$tag" "$chart" "$short"
# One command, so a tag without a signature can't reach the push. cat-file tag refuses anything but a tag object.
[ $next != release ] \
  && printf "  git cat-file tag %s | grep -q '^-----BEGIN SSH SIGNATURE-----\$' && git push origin refs/tags/%s\n" "$tag" "$tag"
printf '  gh release create %s --verify-tag --latest --title "%s" --notes-file <notes file>\n' "$tag" "$chart"
printf '  %s --recheck %s\n' "$0" "$sha"
