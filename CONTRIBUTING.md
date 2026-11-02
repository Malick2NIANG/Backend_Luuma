# Contributing

## Branch flow

Promote work through pull requests in this order:

`feature/*` → `develop` → `staging` → `preprod` → `main`

- Branch features and fixes from `develop`, then open a pull request into `develop`.
- Promote each integrated version with a pull request to the next branch.
- Do not push directly to the shared environment branches.
- `develop` is the intended default branch; `main` contains production-ready code.

## Pull request requirements

Require the `Backend build` check before merging pull requests into `develop`, `staging`, `preprod`, and `main`.

Require no review approval for `develop`. Require at least one approved review for `staging`, `preprod`, and `main`.

Configure these rules in GitHub repository settings; the workflow cannot enforce branch protection by itself.

## Continuous integration and deployment

`.github/workflows/ci.yml` runs `npm ci`, generates the Prisma client, and builds the NestJS application on pull requests and pushes to the four shared branches.

This workflow provides CI only. Configure deployment separately once the hosting target, environments, migration policy, and required secrets have been decided.
