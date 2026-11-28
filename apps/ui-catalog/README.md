# Chulane UI catalog

Run `pnpm --filter ui-catalog dev` from the workspace root. Browse [the reference](http://localhost:5273/components) or [composed examples](http://localhost:5273/examples). Each reference page displays the JSX from its running example and props derived from the built library declarations. Demo conversations, edits and page records live in memory. Theme and navigation preferences use local storage.

`pnpm --filter ui-catalog test:e2e` runs the production catalog in Chromium; screenshots and failure traces are written to `test-results/`. See the [delivery plan](../../docs/chulane-ui-plan.md).

The original PoC is at `/home/vlad/orca/workspaces/chulane/temp_app`. Only subagents may inspect it, and their tasks there are read-only. Make library and catalog changes in the current workspace.
