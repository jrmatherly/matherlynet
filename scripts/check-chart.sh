#!/usr/bin/env bash
# Checks the Helm chart from `DEPLOY_TARGET=k8s aspire publish` before CI pins an image into it and pushes it.
# Usage: scripts/check-chart.sh <chart dir>   (CI: e2e.yml on pull requests, publish-images.yml before the image push)
set -euo pipefail

chart=${1:?usage: check-chart.sh <chart dir>}
fail() {
  echo "::error::$*"
  exit 1
}

helm lint "$chart"

# CI pushes `matherlynet-<version>.tgz` to .../charts/matherlynet; the name comes from withChartName in apphost.mts.
name=$(yq '.name' "$chart/Chart.yaml")
[ "$name" = matherlynet ] || fail "the chart is named '$name', not matherlynet"

# helm lint passes a chart whose web Deployment ignores the value CI pins, so render it with a probe value.
# Rendered to a file: the step must stop when `helm template` fails, and a pipe would report only grep's status.
rendered=$(mktemp)
helm template "$chart" --set parameters.web.web_image=pin-probe > "$rendered"
grep -qF 'image: "pin-probe"' "$rendered" || fail "the web Deployment does not render parameters.web.web_image"
