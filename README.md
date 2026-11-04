# Luuma Backend

NestJS API for the Luuma marketplace, backed by PostgreSQL and Prisma.

## Local development

1. Install Node.js 22 and PostgreSQL.
2. Copy `.env.example` to `.env` and set the required local values.
3. Run `npm ci`.
4. Run `npx prisma generate`.
5. Apply migrations with `npx prisma migrate deploy` (or `npm run db:migrate` for local development).
6. Start the API with `npm run start:dev`.

The API listens on the configured `PORT`; in non-production mode, Swagger is available at `/docs`.

## Branch flow and CI

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the `feature/*` → `develop` → `staging` → `preprod` → `main` promotion flow and required reviews.

GitHub Actions runs the backend install, Prisma generation, and build checks for pull requests and pushes to the shared branches. Deployment is not configured yet.
