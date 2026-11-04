# Contributing

## Branch flow

Promote work through pull requests in this order:

`feature/*` → `develop` → `staging` → `preprod` → `main`

- Create feature and fix branches from `develop`, then open a PR into `develop`.
- Promote each integrated version with a PR to the next branch in the sequence.
- Do not push directly to the shared environment branches.
- `develop` is the intended default branch; `main` contains the production-ready version.

## Pull request requirements

The GitHub branch rules should require both CI checks to pass before merging:

- `Backend build`
- `Frontend Android export`

Require no review approval for PRs into `develop`. Require at least one approved review for PRs into `staging`, `preprod`, and `main`.

These are repository settings in GitHub and are not configured by the workflow itself.

## Continuous integration

`.github/workflows/ci.yml` runs for PRs targeting, and pushes to, `develop`, `staging`, `preprod`, and `main`. It installs each application's locked dependencies, generates the Prisma client, builds the NestJS backend, and exports the Expo frontend for Android. This workflow validates builds only; it does not deploy either application.
