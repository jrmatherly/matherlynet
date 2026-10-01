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
  - `addDatabase()` only creates the DB under `aspire run`; published output relies on `POSTGRES_DB`.
  - `addViteApp` already owns the `http` endpoint: pin its port via `withEndpointCallback`, never
    `withHttpEndpoint`.
  - `ASTRO_DEV_BACKGROUND=0` is required: Astro 7 detaches `astro dev` when it detects an AI agent.
  - The Dockerfile's pnpm version comes from `web/package.json` `packageManager`; base images from
    `withDockerfileBaseImage`. Changing `packageManager` requires `pnpm install` to refresh the lockfile.
  - `aspire deploy` to Kubernetes requires a container registry; `Aspire.Hosting.Kubernetes` is preview.
  - Kubernetes output has no Job support; migrations therefore run inside `web` on start.
  - `withHttpProbe` also registers a health check keyed by path, so the startup, readiness and liveness probes
    use different query strings on `/api/auth/ok` and there is no separate `withHttpHealthCheck`.
  - A stopped resource's local port stays open (DCP proxy) and never answers: clients need connect timeouts.
  - `config.getConfigValue` returns strings; an appsettings.json boolean arrives as `"True"`. Read switches with
    `flag()` (true/false in any case, anything else throws), never `=== 'true'`.
  - The TS `Service` type for Compose has no `healthcheck` member. The published dashboard is configured through
    `configureDashboard` → `publishAsDockerComposeService` (its UI port is bound to loopback).
- Root `package.json` is the AppHost's npm project: keep `vscode-jsonrpc` on 8.x and TypeScript on
  6.0.x (see AGENTS.md); `tsconfig.apphost.json` must keep `"types": ["node"]` for TypeScript 6.
