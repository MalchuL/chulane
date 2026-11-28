# Repository Guidelines

## Structure and Ownership

This pnpm/Turborepo workspace is currently a starter. `apps/web/` and `apps/docs/` are example Next.js apps; `packages/ui/`, `packages/eslint-config/`, and `packages/typescript-config/` are shared starter packages. `app/` is reserved for the Chulane application; `vendor/` is available for workspace dependencies. The application, editor, Cordis, and DeepSeek Harness are not yet integrated here.

Chulane is a local-first knowledge application. Its target includes pages, projects, journals, AI, extensions, and synchronization. Treat product requirements as targets, not evidence of implemented features.

- Reuse the existing Rivto editor for document editing and its page and canvas surfaces. Keep reusable editor behavior in the editor; Chulane owns application workflows, access, storage, and integration. Inspect the editor's current APIs before integrating it.
- Reuse [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) in the application. Inspect its current architecture, supported integration points, and license before choosing how to integrate it; its APIs may change. Extend its existing agent capabilities instead of independently rebuilding them.
- Use Cordis as the main application plugin and service composition system. Give plugins explicit ownership of registrations and resources, and clean them up with their lifecycle. Integrate with the Harness's Cordis composition through supported extension points.
- Keep domain operations and access checks shared by UI and AI tools. Keep storage and transport details behind application-owned interfaces; preserve validation, transactions, and error behavior across adapters.

For product requirements and prior decisions, consult `/media/ssd_stuff/work/assistants/rivto-app_v2/dev_notes/chulane-prd-ru.md`, `chulane-reimplementation-plan.md`, and `chulane-reimplementation.md` in that directory. For transfer and current limitations of the old app, read `chulane-repository-transfer.md` there. The old app's `app/chulane/CONTEXT.md`, `AGENTS.md`, and `docs/adr/000[1-4]-chulane-*.md` provide domain and architectural context. These are historical references outside this repository: verify them against current code and decisions before applying them.

## Working on Changes

1. Read the affected package's guidance and manifest; trace the operation through its owners and callers before editing.
2. For a reported bug, reproduce it with the narrowest meaningful test and confirm the failure before fixing the shared owner. Add a regression at the appropriate boundary.
3. For UI and cross-layer behavior, verify the actual rendered interaction in a browser or desktop host. For persisted data, consider validation, transactions, recovery, and access control.
4. Run focused tests and relevant type checks and lint; build when exports or integration change. Report what was and was not validated.

Use `pnpm dev`, `pnpm build`, `pnpm lint`, `pnpm check-types`, and `pnpm test` for workspace tasks; inspect package scripts for focused commands. A task only runs in packages that define it. Use `*.test.ts(x)` for unit or integration tests and `*.spec.ts` for browser tests when those frameworks are introduced.

## Style and Reviews

Use TypeScript and ES modules for application code, strict types, existing conventions, and named, narrow contracts. Keep storage implementation types inside their adapters. Use `PascalCase` for types and components, `camelCase` for functions and values, and kebab-case for directories.

Each source file starts with module-level JSDoc describing its purpose, responsibilities, invariants, and relationship to adjacent layers. Document functions and methods with JSDoc explaining behavior, parameters, and return values; omit `@returns` for constructors. Add concise inline comments for non-obvious decisions and invariants.

Define HTML class names as named constants in the narrowest owning scope when assigning or referencing them. Prefer a single main exit point; early guard returns are appropriate for invalid, missing, or no-op conditions.

For UI, favor a minimal, icon-first design. Give icon-only controls accessible names and tooltips, keyboard support, and visible focus; retain text where it clarifies important actions.

Keep commits focused and imperative. Pull requests describe the problem, solution, validation, and API or UI impact.

## Component library and catalog conventions

Apply these conventions in `packages/chulane_ui` and `apps/ui-catalog`, including their tests and configuration.

- Place static imports together after the module JSDoc and directives, before declarations and re-exports. Use top-level `import type` for type dependencies, including component types used with `typeof`. Preserve the order of side-effect imports.
- Group files by component. Keep its hooks in `hooks.ts`, its contracts in `types.ts`, and only re-exports in `index.ts`. Use relative imports inside the library and public package entry points in the catalog.
- Follow the Rivto style for new and edited control flow. Use braces for every branch and loop, put nonempty block bodies on separate lines, and use explicit branches for multi-way decisions. Aim for functions of at most 50 lines. Place private methods after other class members.
- Document each function, hook, component and method at its declaration. Describe concrete behavior, relevant ownership and cleanup, parameters, return values and meaningful failures. Preserve existing explanations when moving code.
- The host owns application data, commands and service lifetimes. A component borrows the narrow contract its callers need. When changing an API, inspect creation, use and cleanup together.
- Install shadcn primitives via the package CLI configuration. Keep theme tokens shared and feature styles alongside their owners. Preserve cascade order in `globals.css`; validate that a consumer can use the public exports and compiled stylesheet.

Treat shadcn/ui registry files, their generated hooks, and the catalog's registry Resizable as vendor sources. Restore or update them through the configured shadcn CLI. Keep Chulane styling and behavior in the owning components and demos.
