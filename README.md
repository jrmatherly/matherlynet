# matherlynet

Astro 7 (SSR, `@astrojs/node`) + better-auth + Drizzle/PostgreSQL, orchestrated by an Aspire 13.6 TypeScript AppHost (`apphost.mts`).

## Prerequisites

Aspire CLI 13.6, .NET 10 SDK, Node 24, pnpm 12, Docker (OrbStack).

After cloning, enable the git hooks (Markdown lint via `.pre-commit-config.yaml`): `pre-commit install`.

## Run locally

```sh
aspire run          # dashboard link is printed; app at http://localhost:4321
```

Postgres runs in a container with a persistent volume. Migrations in `web/drizzle/` are applied before `astro dev` starts.

### OAuth (optional)

A provider is enabled only when both its id and secret are set:

```sh
aspire secret set Parameters:github-client-id <id>
aspire secret set Parameters:github-client-secret <secret>
# same for google-client-id / google-client-secret
```

Callback URLs to register: `http://localhost:4321/api/auth/callback/github` and `.../callback/google`.

## Database schema

After changing the better-auth config (plugins etc.) or `web/src/db/`:

```sh
cd web && APPDB_URI=postgresql://unused pnpm db:generate   # regenerates schema + SQL migration
```

Commit `web/drizzle/`. Migrations run on app start under a Postgres advisory lock, so multiple replicas are safe.

## Deploy

Images are pushed to `ghcr.io/jrmatherly/matherlynet` by `.github/workflows/publish-images.yml` on every push
to `main`. New GHCR packages start private: make them public under Package settings, Danger Zone (one-way for that
package).

```sh
aspire publish -o out/compose                  # Docker Compose: docker-compose.yaml + .env + Dockerfile
DEPLOY_TARGET=k8s aspire publish -o out/k8s    # Helm chart (Aspire.Hosting.Kubernetes is preview)
```

Set `APP_URL` (`Parameters:app-url`) to the public origin when deploying; better-auth builds callback URLs from it.

Kubernetes notes (Aspire 13.6):

- A manual `helm install` must supply secret-derived values the chart leaves empty
  (`secrets.web.APPDB_URI`, connection strings, passwords).
- Pods don't restart on ConfigMap changes; run `kubectl rollout restart` after changing config.
- On OrbStack, a `LoadBalancer` service is reachable at `<service>.<namespace>.k8s.orb.local`.
