---
paths:
  - "apphost.mts"
  - "aspire.config.json"
  - "tsconfig.apphost.json"
  - "package.json"
---

# AppHost (Aspire 13.6, TypeScript)

- After editing `apphost.mts`: `npx tsc -p tsconfig.apphost.json --noEmit`, `npm run lint`, then
  `aspire stop && aspire start && aspire wait web` (AppHost changes need a restart; `web/src` hot-reloads).
- Validate deploy output when touching publish settings: `aspire publish -o out/compose` and
  `DEPLOY_TARGET=k8s aspire publish -o out/k8s`; check Compose with `docker compose config -q`.
- Known 13.6 behaviors (verified, don't "fix" them):
  - `addDatabase()` only creates the DB under `aspire run`; published Compose relies on `POSTGRES_DB` (the
    Kubernetes chart has no Postgres: the database already exists).
  - `addViteApp` already owns the `http` endpoint: pin its port via `withEndpointCallback`, never
    `withHttpEndpoint`.
  - `ASTRO_DEV_BACKGROUND=0` is required: Astro 7 detaches `astro dev` when it detects an AI agent.
  - The Dockerfile's pnpm version comes from `web/package.json` `packageManager`; base images from
    `withDockerfileBaseImage`. Changing `packageManager` requires `pnpm install` to refresh the lockfile.
  - `aspire deploy` to Kubernetes requires a container registry; `Aspire.Hosting.Kubernetes` is preview.
  - Kubernetes output has no Job support; migrations therefore run inside `web` on start.
  - Under `DEPLOY_TARGET=k8s` there is no `pg`: web gets `APPDB_URI` from the `appdb-uri` parameter (chart value
    `secrets.web.appdb_uri`; Umami's copy is `secrets.umami.appdb_uri`). It is an `optionalParameter` because a
    parameter with no value fails a non-interactive publish. `withDashboard({ enabled: false })` drops the dashboard
    and every OTEL_* value from the chart.
  - `publishAsNodeServer('start.mjs', { outputPath: '.' })` emits `USER node` and `ENTRYPOINT ["node","start.mjs"]`
    and copies the build stage's `/app` (node_modules included). `publishAsPackageScript` emits no `USER`, and its
    `pnpm run` fails as a non-root user.
  - The Kubernetes publisher writes probe schemes in lower case (`scheme: "http"`), which the API server rejects, and
    `withHttpProbe` has no scheme option. The `fix-probe-scheme` pipeline step (after `publish-k8s`) upper-cases
    them in any quoting, throws if a scheme line is still not `HTTP` or `HTTPS` afterwards, and throws "remove this
    step" once every scheme is already valid. `scripts/check-chart.sh` allows only those two values. `helm lint`
    and `helm template` don't catch this kind of error: check a chart change with
    `helm template out/k8s | kubectl apply --dry-run=server -f -` on a local cluster.
  - `withHttpProbe` also registers a health check keyed by path, so the startup, readiness and liveness probes
    use different query strings on `/api/auth/ok` and there is no separate `withHttpHealthCheck`.
  - A stopped resource's local port stays open (DCP proxy) and never answers: clients need connect timeouts.
  - `config.getConfigValue` returns strings; an appsettings.json boolean arrives as `"True"`. Read switches with
    `flag()` (true/false in any case, anything else throws), never `=== 'true'`.
  - The TS `Service` type for Compose has no `healthcheck` member (upstream `Healthcheck` lacks `[AspireExport]`):
    web's healthcheck is `deploy/docker-compose.override.yaml`, which the `copy-compose-override` pipeline step
    copies into the publish output (`Pipeline:OutputPath`; `PipelineStepContext` has no output path). Register
    such steps outside run mode only: `aspire run`/`start` have no `publish-*` steps, and a `dependsOn` naming an
    unknown step fails the AppHost. `/verify` reuses a running AppHost, so restart it (`aspire stop`, then `aspire
    start`) to test AppHost changes; CI's e2e job also runs `aspire publish` for the publish-only code. The Compose
    dashboard (the chart has none) is configured through `configureDashboard` → `publishAsDockerComposeService`
    (UI port on loopback).
- Root `package.json` is the AppHost's npm project: keep `vscode-jsonrpc` on 8.x and TypeScript on
  6.0.x (see AGENTS.md); `tsconfig.apphost.json` must keep `"types": ["node"]` for TypeScript 6.
