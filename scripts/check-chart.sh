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
name=$(yq -r '.name' "$chart/Chart.yaml")
[ "$name" = matherlynet ] || fail "the chart is named '$name', not matherlynet"

# helm lint passes a chart whose web Deployment ignores the value CI pins, so render it with a probe value.
# Rendered to a file, not piped: a `helm template` failure then stops the script with helm's own error instead of
# reading as a missing image value, and `grep -q` can't close the pipe on helm mid-write (pipefail is on).
rendered=$(mktemp)
trap 'rm -f "$rendered"' EXIT
helm template "$chart" --set parameters.web.web_image=pin-probe --set secrets.web.appdb_uri=postgresql://uri-probe > "$rendered"
if ! grep -qF 'image: "pin-probe"' "$rendered"; then
  grep -n 'image:' "$rendered" || true
  fail "the web Deployment does not render parameters.web.web_image"
fi

if ! grep -qF 'APPDB_URI: "postgresql://uri-probe"' "$rendered"; then
  grep -n 'APPDB_URI' "$rendered" || true
  fail "web's APPDB_URI does not render secrets.web.appdb_uri"
fi
# helm lint and helm template don't check a manifest against the API: a lower-case probe scheme renders, and the API
# server then rejects the Deployment at install (fix-probe-scheme in apphost.mts). An allow-list, so a quoting or
# comment the step doesn't know can't slip through. grep -v exits 1 when every line is allowed.
bad=$(grep -E 'scheme:' "$rendered" | grep -vE "^ *scheme: (\"HTTP\"|\"HTTPS\"|'HTTP'|'HTTPS'|HTTP|HTTPS)$" || true)
[ -z "$bad" ] || fail "a probe scheme is not HTTP or HTTPS, the only values the API server accepts: $bad"

# The cluster supplies Postgres and its own telemetry (apphost.mts): web and the opt-in Umami are the only workloads,
# so a bundled database or the Aspire dashboard fails here whatever kind it is rendered as.
objects=$(yq -N '.kind + "/" + .metadata.name' "$rendered")
bad=$(grep -vE '^(ConfigMap|Secret|Service|Deployment)/(web|umami)-' <<<"$objects" || true)
[ -z "$bad" ] || fail "the chart renders objects other than web's and Umami's: $(tr '\n' ' ' <<<"$bad")"
if grep -qF OTEL_EXPORTER_OTLP_ENDPOINT "$rendered"; then
  grep -nF OTEL_EXPORTER_OTLP_ENDPOINT "$rendered"
  fail "the chart renders an OTLP endpoint"
fi
