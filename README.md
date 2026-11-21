# Chulane

Chulane is a local-first knowledge app for writing and organizing pages. The POC runs in Electron and in a browser. Both use Rivto's Page and Canvas surfaces and the same SQLite-backed workspace service. The built-in Mastra sidebar can discuss the open page, find other pages and propose document edits for review.

- [Run the desktop or web app](app/chulane-poc/README.md)
- [Architecture, persistence and release design](app/chulane-poc/ARCHITECTURE.md)
- [PRD feasibility and acceptance evidence](app/chulane-poc/FEASIBILITY.md)

Use Node 24 and pnpm 11.8.0. The app has a dedicated pnpm workspace under `app/chulane-poc/` with its own lockfile for the pinned Rivto source packages. Run its build, type checks and tests there. The outer Turborepo retains the generated example apps and shared packages.
