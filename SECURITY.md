# Security policy

## Reporting a vulnerability

Please report security issues privately through GitHub: open the repository's **Security** tab and choose
**Report a vulnerability**. That creates a private advisory visible only to the maintainer.

Don't open a public issue for a security problem.

Include what you found, how to reproduce it, and the impact you expect. You'll get an acknowledgement within a
few days.

## Supported versions

Only the current `main` branch (what's deployed) is supported. Tagged releases are snapshots of it; fixes land on
`main` only.

## Repository settings

Since 2026-10-30: workflows may use only actions pinned to a full commit SHA (`sha_pinning_required`); the workflow
`GITHUB_TOKEN` is read-only by default and cannot approve pull requests; and the "Protect release tags" ruleset blocks
deleting or force-updating `v*` tags, with no bypass. A release tag is an annotated, SSH-signed tag (`git tag -s`) on
an SSH-signed commit.
