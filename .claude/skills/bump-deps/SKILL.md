---
name: bump-deps
description: Updates matherlynet's dependencies to the latest stable versions as exact pins in both the root AppHost (npm) and web/ (pnpm 12), honoring pnpm's release-age guard and the known version caps, then verifies. Use when the user says "update dependencies", "bump packages", "check for outdated deps", or invokes /bump-deps.
disable-model-invocation: true
---

# Bump dependencies

Bring every direct dependency to its latest stable version as an exact pin, then prove nothing broke.

1. List what is behind: `npm outdated` (repo root) and `pnpm --dir web outdated`.
2. For each candidate, confirm the target version and its publish date:
   `npm view <pkg>@<version> version time.modified`. Prefer the `latest` dist-tag; treat `rc`/`beta` as out of scope
   unless the user asks.
3. Apply the caps below before choosing a version. Record any package you hold back and why.
4. Install exact versions:
   - web: `pnpm --dir web add <pkg>@<version>` (use `-D` for dev deps). pnpm 11+ refuses versions under 1 day old
     by default (`minimumReleaseAge` 1440; nothing here overrides it); for one, `pnpm add` writes a
     `minimumReleaseAgeExclude` entry to `web/pnpm-workspace.yaml`; keep it. Drop the entries for versions you
     replaced, then check `pnpm --dir web install --frozen-lockfile` still passes its supply-chain check.
   - root: `npm install --save-exact <pkg>@<version>`. npm has no release-age guard unless `~/.npmrc` sets
     `min-release-age` (`npm config get min-release-age`); to go past it, add `--min-release-age-exclude=<package-name>`
     (names, not `name@version`; globs work, e.g. `'@typescript-eslint/*'`).
   - Renovate waits 7 days (`minimumReleaseAge` in `.github/renovate.json5`); a manual bump may take newer versions.
5. If pnpm reports `ERR_PNPM_IGNORED_BUILDS`, approve the named package: `pnpm --dir web approve-builds <pkg>`.
6. Run `/verify`. Also confirm `npm ci` and `pnpm --dir web install --frozen-lockfile` succeed from the new lockfiles.
7. Re-check the version-pinned workarounds: `git grep -nE "checked on [A-Za-z0-9@/._-]+ [0-9]"` lists every comment
   and doc line of the form `checked on <package> <version>` (a line can name more than one, as in `checked on pg-pool
   3.14.0 and pg 8.23.1`). For each hit that names a package the bump touched, read the
   installed source again: still needed, update the version in the label; behaviour gone, delete the workaround, its
   comment and the test that covered it.
8. Summarize: old → new per package, held-back packages with reasons, verification result. Don't commit unless asked.

## Version caps (verified 2026-10-21; re-check when the reason may have changed)

Renovate enforces the first three as `allowedVersions` rules in `.github/renovate.json5`; change a cap in both places.
The drizzle cap has no Renovate rule: Renovate skips 1.0 only while it stays a prerelease.

| Package | Cap | Reason |
| :--- | :--- | :--- |
| `vscode-jsonrpc` (root) | 8.x | Aspire 13.6's generated `transport.mts` imports `vscode-jsonrpc/node.js`, removed in 9.x |
| `typescript` (root) | 6.0.x | `typescript-eslint` peer range is `<6.1.0` |
| `@types/node` | Node runtime major (24) | Types must match the runtime, not the newest Node |
| `drizzle-orm` / `drizzle-kit` | 0.45.x / 0.31.x stable | 1.0 is still a release candidate (better-auth 1.7.11 accepts it; the cap is ours) |
| Aspire packages | Aspire CLI version | Update with `aspire update`, not npm (see Aspire below) |

## Aspire

1. Install the new CLI first. It comes from mise here (`mise install github:microsoft/aspire@<version>`; mise's own
   1-day release age may hold `latest` back). Don't use `aspire update --self` on a mise install: it overwrites the
   current version's folder in place.
2. `aspire update -y --non-interactive` moves `aspire.config.json` (SDK and hosting packages, the Kubernetes preview
   build included) and regenerates `.aspire/`. Check the CommunityToolkit packages separately; they ship apart.
3. Bump `ASPIRE_VERSION` and `ASPIRE_SHA512` in `.github/workflows/e2e.yml`, `publish-images.yml` and
   `repo-checks.yml`. Take the
   hash from the release's `.sha512` asset (`gh release download v<version> -R microsoft/aspire -p
   'aspire-cli-linux-x64-<version>.tar.gz.sha512'`, lowercased) and check it with `sha512sum -c` against the tarball.
4. Rehearse publish: `aspire publish -o out/compose`, `DEPLOY_TARGET=k8s aspire publish -o out/k8s`, then
   `scripts/check-chart.sh out/k8s`. `/verify` doesn't run publish.

## Gotchas

- `packageManager` in `web/package.json` sets the pnpm that CI and the image install. Keep the local pnpm on the same
  version: `pmOnFail: ignore` (`web/pnpm-workspace.yaml`) means pnpm doesn't switch to the pin or warn about a mismatch.
- On each bump, re-check every `overrides` entry (root `package.json`, `web/pnpm-workspace.yaml`): `npm view <parent>
  dependencies` shows what a parent asks for. Delete an entry once its parents accept the fix or drop the package.
- Root `tsconfig.apphost.json` must keep `"types": ["node"]` (TypeScript 6 no longer auto-includes `@types`).
