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
bad=$(grep -E 'scheme:' "$rendered" | grep -vE "^ *scheme: (\"HTTP\"|\"HTTPS\"|'HTTP'|'HTTPS'|HTTP|HTTPS)$" || [ $? -eq 1 ])
[ -z "$bad" ] || fail "a probe scheme is not HTTP or HTTPS, the only values the API server accepts: $bad"

# The cluster supplies Postgres and its own telemetry (apphost.mts): web and the opt-in Umami are the only workloads,
# so a bundled database or the Aspire dashboard fails here whatever kind it is rendered as.
objects=$(yq -N '.kind + "/" + .metadata.name' "$rendered")
bad=$(grep -vE '^(ConfigMap|Secret|Service|Deployment)/matherlynet-(web|umami)-' <<<"$objects" || [ $? -eq 1 ])
[ -z "$bad" ] || fail "the chart renders objects other than web's and Umami's, or one without the matherlynet- prefix (prefix-object-names in apphost.mts): $(tr '\n' ' ' <<<"$bad")"
# docs/deployment.md tells an install to route to this Service and patch this Deployment by name.
for object in Service/matherlynet-web-service Deployment/matherlynet-web-deployment; do
  grep -qxF "$object" <<<"$objects" || fail "the chart does not render $object, the name an install keys on"
done
# The prefix is written over the generated names: a reference it missed would leave the pod unable to start.
# The outer parentheses matter: in yq, `a | (b), (c)` runs c against the document, not against a.
refs=$(yq -N '.spec.template.spec.containers[]?.envFrom[]? | ((select(.configMapRef) | "ConfigMap/" + .configMapRef.name), (select(.secretRef) | "Secret/" + .secretRef.name))' "$rendered")
for kind in ConfigMap Secret; do
  grep -q "^$kind/" <<<"$refs" || fail "no Deployment reads a $kind through envFrom, so the reference check has nothing to check for it"
done
bad=$(grep -vxFf <(echo "$objects") <<<"$refs" || [ $? -eq 1 ])
[ -z "$bad" ] || fail "a Deployment refers to an object the chart does not render: $(tr '\n' ' ' <<<"$bad")"
# A reference in any other field (a volume's secretName, a Service host name in a ConfigMap value) is not a `name:`
# the step rewrites. With every prefixed name taken out of the render, no unprefixed one may remain.
bare=$(sed -E 's|^[^/]+/matherlynet-||' <<<"$objects")
bad=$(sed -E 's/matherlynet-(web|umami)-[a-z]+//g' "$rendered" | grep -nFf <(echo "$bare") || [ $? -eq 1 ])
[ -z "$bad" ] || fail "the chart still uses an object's name without the matherlynet- prefix: $bad"
if grep -qF OTEL_EXPORTER_OTLP_ENDPOINT "$rendered"; then
  grep -nF OTEL_EXPORTER_OTLP_ENDPOINT "$rendered"
  fail "the chart renders an OTLP endpoint"
fi
