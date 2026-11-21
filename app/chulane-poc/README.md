# Chulane desktop and web POC

Start with [the implemented architecture](ARCHITECTURE.md) and [the PRD feasibility and acceptance matrix](FEASIBILITY.md). The POC has its own pnpm workspace and lockfile. Run the following from the repository root with Node 24 and pnpm 11.8.0.

```sh
git submodule update --init app/chulane-poc/vendor/rivto
cd app/chulane-poc
pnpm install --frozen-lockfile
pnpm build
pnpm desktop
```

Desktop starts its own loopback service and database. It works without internet after installation. No web server or key setup is required. If Electron was installed without its native binary, run `pnpm exec install-electron`. A graphical session is required on Linux.

For web, run the following from this directory. Enter the editor key in the browser at `http://127.0.0.1:4173`. A separate viewer key grants read and download access. Choose private random keys for your own installation.

```sh
export CHULANE_EDITOR_KEY="$(openssl rand -hex 32)"
export CHULANE_VIEWER_KEY="$(openssl rand -hex 32)"
pnpm web
```

To run the same built web application in Docker, stop the other listener on port 4173 first.

```sh
pnpm docker:prepare
docker build -t chulane-poc .
docker volume create chulane-poc-data
docker run --rm --name chulane-poc -p 127.0.0.1:4173:4173 \
  -v chulane-poc-data:/data -e CHULANE_EDITOR_KEY -e CHULANE_VIEWER_KEY chulane-poc
```

The Dockerfile copies the built app and the portable Mastra dependencies produced by `pnpm docker:prepare` from the same pnpm lockfile. The application serves HTTP. These commands bind it to loopback. Network deployment needs HTTPS termination. Both keys apply to **all workspaces on this instance**. Use separate instances for separate audiences.

## Try the product

1. Create a workspace, add a project with the plus beside **Projects**, and create a page. Type in its first paragraph. Click outside the writing surface or tab to another control to save your changes. Clicking a library destination saves first and then opens it. **Save now** and the single autosave five minutes after opening are also available. Edits sync to other open clients every 500 ms. Once **Saved** appears, switch to **Canvas**, then return to **Page**. Use **Page actions** to rename, move, attach, export, or trash the page. The sidebar’s **Pages** list switches directly between documents in the current view.
2. Return to **All pages** and search for a word from the body. Import a Markdown file or open **Journal → Open today**. Attach an arbitrary file from a document toolbar and download it by name. Trash and restore a page from the library.
3. On web, open independent browser sessions using the same editor key. Open one page in both and edit it. With a viewer key the server permits reads and rejects writes. Desktop has its own database.
4. On desktop, open the native **Plugins → Install from folder…** menu and choose `examples/reading-break`. Confirm the displayed source. The new **Reading break…** command belongs to the plugin. Disable, enable or remove it in the same menu. Keep the folder in place while installed.

## Talk to the built-in agent

Open **Agent** in the workspace toolbar on desktop or web. The sidebar shows which document the next message will use and that the chat is shared. Sending a message checkpoints that document first. You can also start from the library with no page open. To include up to three other pages in a message, drag each page by its grip into the composer or choose **Add page** and search by title. Sent messages keep links to the pages you included. To discuss particular blocks, select them in the editor, then drag the link icon beside any selected block into the composer. Dragging a single block’s link icon also works. Each chip links to its original block and can be removed before sending.

**Use your installed Codex.** Run `codex login status` in a terminal. If prompted, run `codex login`. Start `pnpm desktop` from that terminal, open the chat bubble, then choose **Provider settings → Connection → Local Codex → Use local codex**. Chulane checks the login and remembers your selection on this device. Send a message with a page or block attached. Review the proposed change and choose **Apply**. The CLI handles authentication. [Codex non-interactive mode](https://developers.openai.com/codex/noninteractive)

**Claude Code and Hermes.** The same selector offers **Local Claude Code** and **Local Hermes**. Install and sign in to the corresponding CLI before selecting it. Use versions supporting the non-interactive flags listed in the adapter. Hermes runs with safe mode and its default credential discovery, so custom providers configured only in Hermes config.yaml may need environment configuration. The local runners return a completed answer and can request page searches, reads and edit proposals along the way. [Local adapter](src/server/local-agent.ts) · [Claude Code CLI](https://code.claude.com/docs/en/cli-reference) · [Hermes CLI](https://hermes-agent.nousresearch.com/docs/reference/cli-commands)

**Local browser host.** Run `CHULANE_LOCAL_AGENT=codex pnpm web` with your normal Chulane editor key configured. Supported values are `codex`, `claude` and `hermes`. The executable and credentials belong to the server OS user. Enabling it lets all editors of that installation use that account. The sidebar cannot choose an executable path or switch the server's agent.

**API connection.** On desktop, enter an OpenAI API key and model in **Agent → Provider settings** (the form is shown automatically on first use). The device shares this setting across local workspaces. The host encrypts the key with Electron safeStorage when a secure OS backend is available. Otherwise, it holds the key until quit and tells you to configure it again next time. The chat database and its backup contain no provider key.

For web, set `OPENAI_API_KEY` in the server process environment before `pnpm web`. Set `CHULANE_AI_MODEL` to a tool-capable OpenAI model available to the configured account. Model IDs containing `codex` use the Responses API. Other model IDs use Chat Completions. The default is `gpt-4.1-mini`. Pass the same variables to Docker with `-e OPENAI_API_KEY -e CHULANE_AI_MODEL`. Host environment values also work on desktop. A Codex CLI login is separate from the provider API key. Messages and selected page excerpts go to the configured provider. All editors on this installation share its provider usage.

1. From *Meeting notes*, ask “Find Roadmap and add a paragraph summarizing the launch decision from this page.”
2. Inspect the target page and the before/after text in the chat. **Apply** records the change and **Dismiss** closes the proposal. **Open page** goes to the target. If the original block changed during review, dismiss the stale proposal and request a revision.
3. Switch pages and continue the conversation. **Stop response** cancels a turn. Closing the browser tab or desktop window interrupts it. Reopen the workspace to review saved messages and pending edits. A viewer can read shared history.

Run `pnpm smoke:agent` after building for a repeatable Chromium and Linux Electron check using a local scripted provider. With your local login, run `CHULANE_LOCAL_AGENT=codex pnpm smoke:agent:live` (or select `hermes` or `claude`). With an API key, run `pnpm smoke:agent:live`. This runs one real multi-step turn against a temporary workspace containing synthetic notes. It uses the configured provider and can incur API charges.

## Access from a tool

Set `CHULANE_URL`, `CHULANE_ACCESS_KEY`, and `CHULANE_WORKSPACE` in the calling process. The default URL is the loopback web service and the default workspace ID is 1. The access key can be either configured web key. Tools authenticate at the same service as a browser.

```sh
export CHULANE_URL=http://127.0.0.1:4173 CHULANE_ACCESS_KEY="$CHULANE_EDITOR_KEY" CHULANE_WORKSPACE=1
node src/tools/cli.ts workspaces
node src/tools/cli.ts projects
node src/tools/cli.ts search observation
node src/tools/cli.ts read 1
node src/tools/cli.ts propose_create "Reading list"
node src/tools/cli.ts propose_rename 1 "Field observations"
```

An editor sees the proposed action in the workspace and chooses **approve** or **dismiss**. An approval transaction records the decision and applies the change. The CLI returns the pending request ID when it proposes a change.

The same six operations are available through DeepSeek Harness. Start the Chulane web service first, export the three variables above in a second terminal, and run these commands from the POC directory. Use Node 24.9 or later with this Harness release.

```sh
export CHULANE_MCP_ENTRY="$PWD/src/tools/mcp.ts"
npx @deepseek-ai/dsh@0.2.2-rc.5 web --patch "$PWD/examples/chulane.cordis.yml" --no-open
```

Open the Harness address printed by the launcher. In a profile with a configured model, ask it to search the library using `mcp__chulane__search`. Chulane source links open the corresponding document in the browser. Choose the viewer key for read-only access. A proposal made with an editor key still requires approval in Chulane. [Runnable Harness overlay](examples/chulane.cordis.yml) · [Upstream MCP configuration](https://github.com/deepseek-ai/deepseek-harness/tree/2e39e70496aa02986ca6a820c5d497e816b69d7e/packages/mcp/mcp-client)

## Backup and restore

Close the desktop app or stop the web process cleanly. Copy the **whole data directory** while it is closed, including any SQLite journal sidecars. Keep the original until the restored copy has been checked. Files, document states, metadata, trash and pending decisions live together in SQLite.

| Host | Data location |
|---|---|
| Web | `CHULANE_DATA`, default `./data` relative to the launch directory |
| Docker | Named volume mounted at `/data` |
| Desktop | Electron `app.getPath('userData')` for Chulane POC. Usual bases are `$XDG_CONFIG_HOME` or `~/.config` on Linux, `~/Library/Application Support` on macOS and `%APPDATA%` on Windows. File name is `workspace.sqlite`. |

To check a web backup separately, copy the closed data directory to an empty directory, set `CHULANE_DATA` to that copy, set new access keys, and start `PORT=4174 pnpm web`. Sign in, reopen a known document and download an attachment. Disk backups contain readable workspace data. Session cookies expire on process restart. Web keys are deployment environment values. Desktop plugin settings store paths in `plugins.json`; back up the trusted source directories separately if needed.

## Verification

```sh
pnpm check-types
pnpm test
pnpm exec playwright install chromium
pnpm smoke
```

Build before running smoke. `pnpm exec tsx tests/e2e/hosts.spec.ts web` and `pnpm exec tsx tests/e2e/hosts.spec.ts desktop` exercise the hosts independently. The tests use temporary profiles and databases. The desktop plugin check supplies a temporary test answer to Electron's native folder and confirmation dialogs.

To exercise the published Harness executor without a provider account, run this optional smoke from the POC directory. It installs the pinned launcher through npm, uses a disposable profile, and asserts the page link returned by a real tool call.

```sh
npm exec --yes --package=@deepseek-ai/dsh@0.2.2-rc.5 -- pnpm exec tsx tests/e2e/harness.spec.ts
```
