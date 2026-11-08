# Chulane

A pnpm workspace managed with Turborepo. The generated starter includes example apps and shared packages. The existing Chulane application is a reference for a later transfer.

## Requirements

- Node.js 24 or newer (required by the generated starter)
- pnpm 11.8.0

Run `pnpm install --frozen-lockfile` to install dependencies. Workspace packages belong in `apps/`, `app/`, `packages/`, or `vendor/`. The starter examples are in `apps/`; `app/` is reserved for the Chulane transfer. Once packages are added, use `pnpm build`, `pnpm dev`, `pnpm lint`, `pnpm check-types`, and `pnpm test` to run their corresponding scripts through Turborepo.
