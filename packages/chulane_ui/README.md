# Chulane UI

A React 19 component library for a local-first knowledge workspace. The public package contains ESM, TypeScript declarations and compiled CSS. Radix primitives provide overlay focus management; shadcn/ui and Tailwind CSS 4 are configured in this package.

## Use in a workspace app

Add `@chulane/ui` with the version `workspace:*`. Install React and React DOM 19 in the consuming app. Import the compiled stylesheet once at your application entry point.

```tsx
import "@chulane/ui/styles.css"
import { Button, DocumentSurface } from "@chulane/ui"
```

Use `cu-surface` on a container to apply library typography. Override semantic `--ui-*` CSS properties on that container. Set `data-theme="light"` or `data-theme="dark"` on a theme root. The optional `useTheme` hook manages the document preference, persistence and OS changes. Wrap local overrides in `ThemeScope` to keep menu, dialog and tooltip portals inside the same theme.

The host supplies command callbacks, editor content, messages and operation status. Apply and undo are requests to the host. Render their confirmed result by updating the controlled props.

## Component contracts

- `Checkbox` accepts `checked` and `onCheckedChange`, including the Radix `"indeterminate"` value.
- `ThemeScope buttonLayout="separate"` changes action spacing for its descendants. A `ButtonGroup` can override the scope. The default is `"grouped"`.
- Give every `FileTree` node a unique, stable ID. The host controls selection. Pass `expandedIds` and `onExpandedChange` to store expansion with workspace preferences.
- Put `AgentMessage` elements inside `AgentPanel`. Pass the host's message ID as both the React key and `messageId`, and set `side="user"` on outgoing messages. Reuse the assistant ID as tokens arrive. Each conversation owns its panel and draft. The panel provides the scroll viewport and jump-to-latest control.
- Use `InlineCitation` in response prose, `references` for the source list, and `activity` for host-provided tool, reasoning, task or plan descriptions.

## Catalog

From the workspace root run `pnpm --filter ui-catalog dev`. Open [Components](http://localhost:5273/components) for usage, live examples, TypeScript props, keyboard behavior and token names. [Examples](http://localhost:5273/examples) contains the workspace, editor and agent-review compositions.

## shadcn/ui source

The CLI configuration is [components.json](components.json). Registry primitives live in [src/components/ui](src/components/ui). The library composes radix-nova controls, dialogs, command menus, navigation and AI Elements. The catalog owns the Resizable demonstration. A consumer can supply its own layout through `WorkspaceShell.renderPanels`.

[src/globals.css](src/globals.css) compiles to `@chulane/ui/styles.css` and includes Tailwind, shadcn variants, semantic color aliases and the component stylesheets. [foundation/tokens.css](src/foundation/tokens.css) defines the two palettes and geometry.

## Development

- `pnpm --filter @chulane/ui exec shadcn add <component>` installs a registry primitive.
- `pnpm --filter @chulane/ui build` builds the library and declarations.
- `pnpm --filter @chulane/ui pack` builds the library and creates a tarball you can install in another app.
- `pnpm --filter @chulane/ui check-types`, `lint`, `format:check` and `test` check the package.
- `pnpm --filter ui-catalog test:e2e` builds both packages, starts a local preview and exercises Chromium and axe. Install the browser with `pnpm --filter ui-catalog exec playwright install chromium --only-shell`.

See the [implementation plan](../../docs/chulane-ui-plan.md).
