# Chulane

Chulane is a local-first knowledge app for writing and organizing pages. The POC runs in Electron and in a browser. Both use Rivto's Page and Canvas surfaces and the same SQLite-backed workspace service. The built-in Mastra sidebar can discuss the open page, find other pages and propose document edits for review.

Run these commands from the repository root with Git, Node 24 and pnpm 11.8.0.

```sh
pnpm run setup:desktop
pnpm desktop
```

Setup fetches the pinned editor and Electron runtime and builds the app. For later launches, run `pnpm desktop`. Create a workspace, select **New page**, and start writing. To use your existing Codex login, open **Agent → Use local codex**.

- [Desktop setup and local agents](app/chulane-poc/README.md)
- [Start a self-hosted web server](app/chulane-poc/README.md#start-a-named-account-web-server)
- [Architecture, persistence and release design](app/chulane-poc/ARCHITECTURE.md)
- [PRD feasibility and acceptance evidence](app/chulane-poc/FEASIBILITY.md)

The app has a dedicated pnpm workspace under `app/chulane-poc/` with its own lockfile for the pinned Rivto source packages. Run its build, type checks and tests there. The outer Turborepo retains the generated example apps and shared packages.
