---
name: bump-deps
description: Updates matherlynet's dependencies to the latest stable versions as exact pins in both the root AppHost (npm) and web/ (pnpm 12), honoring the 7-day release-age guards and the known version caps, then verifies. Use when the user says "update dependencies", "bump packages", "check for outdated deps", or invokes /bump-deps.
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
   - web: `pnpm --dir web add <pkg>@<version>` (use `-D` for dev deps). For a version under 7 days old, pnpm adds
     a `minimumReleaseAgeExclude` entry to `web/pnpm-workspace.yaml`; keep it.
   - root: `npm install --save-exact <pkg>@<version>`. For a version under 7 days old add
     `--min-release-age-exclude=<package-name>` (names, not `name@version`; globs work, e.g. `'@typescript-eslint/*'`
     for packages whose siblings pin the same new version).
5. If pnpm reports `ERR_PNPM_IGNORED_BUILDS`, approve the named package: `pnpm --dir web approve-builds <pkg>`.
6. Run `/verify`. Also confirm `npm ci` and `pnpm --dir web install --frozen-lockfile` succeed from the new lockfiles.
7. Summarize: old → new per package, held-back packages with reasons, verification result. Don't commit unless asked.

## Version caps (verified 2026-09-30; re-check when the reason may have changed)

| Package | Cap | Reason |
| :--- | :--- | :--- |
| `vscode-jsonrpc` (root) | 8.x | Aspire 13.6's generated `transport.mts` imports `vscode-jsonrpc/node.js`, removed in 9.x |
| `typescript` (root) | 6.0.x | `typescript-eslint` peer range is `<6.1.0` |
| `@types/node` | Node runtime major (24) | Types must match the runtime, not the newest Node |
| `drizzle-orm` / `drizzle-kit` | 0.45.x / 0.31.x stable | 1.0 is a release candidate; better-auth's generator targets 0.45 |
| Aspire packages | Aspire CLI version | Update with `aspire update`, not npm |

## Gotchas

- Changing `packageManager` in `web/package.json` requires `pnpm --dir web install` to refresh the lockfile, or the
  Docker build fails with `ERR_PNPM_FROZEN_LOCKFILE_WITH_OUTDATED_LOCKFILE`.
- Root `tsconfig.apphost.json` must keep `"types": ["node"]` (TypeScript 6 no longer auto-includes `@types`).
