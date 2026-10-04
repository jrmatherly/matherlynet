# Summary

<!-- What changes and why, in a sentence or two. Link the plan, issue or review finding it comes from. -->

## Changes

<!-- The notable changes, one bullet each. Commit messages carry the detail. -->

-

## Verification

<!-- Evidence, not intentions: what ran and what it showed. -->

- [ ] `/verify` passes (AppHost eslint + tsc, Markdown and workflow lint, astro check, lint, tests, build, smoke, E2E)
- [ ] New or changed behavior has a test that failed before the change
- [ ] Checked against a production build where it matters (CSP, headers, `NODE_ENV=production` behavior)

## Deployment impact

<!-- Tick what applies and say what an operator has to do (or "none"). -->

- [ ] `apphost.mts` / publish output changes (checked with `aspire publish`, Compose and `DEPLOY_TARGET=k8s`)
- [ ] New Aspire parameter, config key or environment variable (documented in `docs/deployment.md`)
- [ ] Database migration (`pnpm db:generate` output committed)
- [ ] Dependencies changed (exact pins; caps in AGENTS.md and `.github/renovate.json5` still hold)
- [ ] CSP, security headers, auth or telemetry behavior changes
- [ ] Manual step needed at deploy

## Docs

- [ ] AGENTS.md, `.claude/rules/` or `docs/deployment.md` updated for anything another agent or operator needs to
      know
