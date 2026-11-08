# Chulane

A pnpm workspace managed with Turborepo. The repository is initialized without application packages; the existing Chulane application is a reference for a later transfer.

## Requirements

- Node.js 22.6 or newer
- pnpm 11.8.0

Run `pnpm install --frozen-lockfile` to install dependencies. Workspace packages belong in `app/`, `packages/`, or `vendor/`. Once packages are added, use `pnpm build`, `pnpm dev`, `pnpm lint`, `pnpm check-types`, and `pnpm test` to run their corresponding scripts through Turborepo.
