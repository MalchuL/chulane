# Chulane desktop and web POC

Start with [the implemented architecture](ARCHITECTURE.md) and [the PRD feasibility and acceptance matrix](FEASIBILITY.md). The POC has its own pnpm workspace and lockfile. Run the following from the repository root with Node 24 and pnpm 11.8.0.

```sh
git submodule update --init app/chulane-poc/vendor/rivto
cd app/chulane-poc
pnpm install --frozen-lockfile
pnpm build
pnpm desktop
```

### Install the Linux desktop package

On a Debian-family Linux build machine, run `pnpm package:deb` from this directory after the frozen install above. It uses the native Electron download and `dpkg-deb` to write an installer under `dist-host/`. Copy that file to the target desktop. Node, pnpm and a source checkout are only needed on the build machine.

For the amd64 package, run the following from the folder containing the downloaded file. Then open **Chulane** from the applications menu or run `chulane` as your desktop user.

```sh
sudo apt install ./chulane_0.0.0~poc1_amd64.deb
```

The app stores workspaces in your user profile. Reinstalling the package preserves that profile. To test a build on a graphical Linux machine with unprivileged user namespaces, run `pnpm smoke:deb dist-host/chulane_0.0.0~poc1_amd64.deb`. This installs into a temporary package database and reopens a disposable workspace after restarting the installed executable.

### Install the macOS desktop app

On a Mac with Xcode Command Line Tools, run `pnpm package:macos` after the frozen install above. The command produces `dist-host/chulane-macos-arm64.zip` on Apple Silicon or `dist-host/chulane-macos-x64.zip` on an Intel Mac. Extract the ZIP, drag **Chulane.app** to **Applications**, and open it. Workspace data stays in your user profile when you replace the app.

The Mac build applies and verifies a local ad-hoc signature. Developer ID signing and Apple notarization remain release steps. A Linux cross-build (for example, `pnpm package:macos arm64`) produces an archive marked `-unsigned` for inspection.

To test a locally built archive on a Mac, run `pnpm exec playwright install chromium` once, then `pnpm smoke:macos dist-host/chulane-macos-arm64.zip` (use `x64` for Intel). The test extracts the archive in a temporary Applications folder, verifies its signature, creates a workspace, reopens a saved page after restart, and exercises the agent sidebar with fixtures.

### Install the Windows desktop package

On a Linux build host with Node 24, pnpm 11.8.0, NSIS 3 (`makensis`) and `unzip`, run `pnpm package:windows` from this directory. Copy `dist-host/chulane-setup-x64.exe` to the Windows x64 desktop. Close any running Chulane instance, run the installer, and open **Chulane** from Start. It installs for the current user and appears in **Settings → Apps → Installed apps**. Uninstalling leaves the user's workspace profile intact. This build is unsigned.

To validate the installed executable on a Windows test machine with this checkout and its test dependencies, run in PowerShell from this directory:

```powershell
$env:CHULANE_TEST_INSTALLED_DESKTOP = "$env:LOCALAPPDATA\Programs\Chulane\runtime\Chulane.exe"
pnpm smoke desktop
Remove-Item Env:CHULANE_TEST_INSTALLED_DESKTOP
```

Already signed in to Codex on this machine? Open **Agent → Use local codex** to use that login in the document sidebar. See [Connect Codex on desktop](#connect-codex-on-desktop) for the provider selector and a first edit.

Desktop starts its own loopback service and database. On first launch, enter a workspace name, choose its journal time zone and select **Create workspace**. It works without internet after installation. No web server or key setup is required. If Electron was installed without its native binary, run `pnpm exec install-electron`. A graphical session is required on Linux.

Open **Appearance** (the palette in the navigation footer) to set application colors, typeface, and base text size. The editor has its own background, text color, typeface, and size. **Save theme** applies the settings on this device. **Restore defaults** clears them. Named server accounts have separate preferences in each browser profile. The local desktop workspace keeps its theme through process restarts.

On desktop, open the archive icon beside the workspace selector and choose **Archive** for the current workspace. Archiving saves its accepted drafts and interrupts its running agent tasks. Restore the workspace from that menu, or from **Archived workspaces** on the opening screen if you archived the last workspace. Its pages, calendar settings and chat history retain their IDs. The owner can choose **Mark for deletion** beside an archived workspace and confirm. On a named server, the server administrator can recover or permanently delete a marked workspace from the archive menu or workspace picker. Recovery preserves memberships. On Electron, choose **Review restored edits** to sync queued changes one page at a time after restoration, or download them for recovery. Edits from a permanently deleted workspace remain available for export. For local workspaces the device user is the administrator. Permanent deletion removes that workspace’s records and attachments from the application database. New snapshots omit freed database pages. Existing backups can still contain deleted content.

To open server workspaces in Electron, choose **Workspace connections** in the local sidebar footer or on the first-run screen. Enter the server’s HTTPS address (HTTP works on loopback), then sign in in the new window. Reopen **Workspace connections** to see accessible workspaces grouped by server alongside your local workspaces. Each server has a separate browser session. Closing and reopening a remote workspace preserves acknowledged edits on that server. Saved server addresses survive a desktop restart. **Forget server** clears the profile on this device after its windows are closed. For a named account, open the documents you need before disconnecting. Offline library search reads downloaded pages and includes this device’s pending edits. After restarting Electron offline, search for a paragraph, a canvas label, or a phrase inside a downloaded UTF-8 text, Markdown, CSV, or TSV attachment. An attachment-only result shows the filename and matching passage. Select the paperclip beside a search result to see each matching file and download it directly. Offline results include files downloaded on this device. A paragraph result takes you to its block. Offline, open **Tags** to follow saved assignments to downloaded pages and blocks. Block excerpts include pending device edits. Choose **Page actions → Markdown** on a downloaded page to export its current device copy, including pending text and canvas labels. Its filename uses the title on this device. The tag picker shows assignments for the current page or block. Choose **Show field table** to sort and filter saved field values and open a tagged page or block. Changing tags or field values requires a connection. If the server goes offline, continue writing until **Saved on device · waiting to sync** appears. If the server is reachable but your session expires, the sign-in screen lists previously opened workspaces under **Work offline**. Choose one to continue editing cached pages. Use **Sign in to sync** when you are ready to reconnect. You can restart Electron, open the unavailable server from **Workspace connections**, and resume the cached document. Reconnecting and signing back in as the same account merges its pending edits with the current server document. Pending edits to other pages in that workspace also sync when the workspace reopens. Server confirmation changes the status to **Saved**. If an upload fails, use **Retry workspace sync** (the circular arrow in the workspace toolbar). It checks open editors and retries pending edits to closed pages. A failed manual attempt shows **Sync error** and a notification. You can leave a page once its edits are saved on the device. The drive icon marks pages and attachments available offline. A cloud icon marks online-only items. Open a page or use its attachment link while connected to keep a copy in Chulane. Uploading an attachment also caches its bytes when space permits. Offline downloads preserve the original filename. Workspace access revocation clears the cached files. Page renames can also be saved offline. Project moves, new uploads and agent runs require connectivity.

If access changes before your edits can sync, sign in as the same account and choose **Export unsynced edits** in the sidebar footer or on the opening screen. Select a page to download its recovery JSON file. The file includes pending renames with their original and requested titles. If it has document edits, it also includes readable writing text and the complete merged Yjs document update in Base64, including block and canvas data. It identifies the server, account profile, workspace and page. For pages with pending content edits, choose **Export as Markdown** beside the page. Import the downloaded file into a workspace you can edit to create a new page. The dialog reports formatting losses. Workspace metadata and attached files are excluded from Markdown. Both downloads keep the pending edits on the device. After the server reports loss of workspace access, Chulane removes the synchronized workspace cache. Recovery files contain document snapshots. Attachment bytes are stored separately.

In a connected desktop workspace, you can move a cached page while offline. The move survives restart and is included in **Export unsynced edits**. If the page or destination goes to Trash before sync, the server keeps the proposed move for review.

If two editors move a page from the same project to different destinations, open the page and use **Conflicting page locations** to keep its current location or select the alternative. The choices include the project path and ID so equally named folders can be distinguished. If saving fails, retry the same choice. A repeated delivery preserves a decision that already reached the server.

When two editors rename the same project from the same original name, open the project and use **Conflicting project names** to choose which name to keep. Its pages and subprojects stay in place. In a desktop server workspace you can rename a cached project offline. The name survives restarting the app, and Chulane syncs it when you reconnect with editing access. **Export unsynced edits** can download the pending project rename as JSON. If an administrator restores the workspace after deletion, use **Review restored edits** to decide whether to send each project rename. If the connection drops while saving a project name, leave the dialog open and retry **Save**. An identical retry preserves any decision another editor has made in the meantime.

If another editor renames a page while your rename dialog is open, both titles are saved. Open the page and use **Conflicting page titles** to keep the current name or use the alternative. Editors can resolve the choice after a restart. A named-account desktop user can rename a cached page while disconnected. The workspace shows the new name after it is saved on the device. Once connected, review any competing server title on that page.

For a named-account server, create the first server administrator from the installation host. After building the web app, run these commands in Bash. Pick a new username and a password of 12–256 characters.

```bash
read -rsp 'First administrator password: ' admin_password && echo
printf '%s' "$admin_password" | node dist-host/web/main.mjs create-admin operator
unset admin_password
pnpm web
```

Sign in as `operator` and open **Server settings** on the initial workspace screen or in the navigation footer. **Allow public account registration** takes effect immediately. Registration starts closed after bootstrap. Creating a workspace gives its creator the workspace owner role. The server administrator sees only workspaces they belong to. Existing installations can create the administrator with the same command and an unused username. Bootstrapping again cannot replace the administrator. The server role and registration setting are included in workspace snapshots. In **Server settings → Shared AI provider**, enter the model and API key, then choose **Save shared provider**. The form shows where messages and selected document context will be sent. Editors in all server workspaces use this connection on their next turn. Leave the key blank to keep it while changing the model. **Restore host provider defaults** removes the override and returns to the deployment environment settings.

Installations using the original environment-based registration can keep using `CHULANE_ALLOW_REGISTRATION=1` until they create an administrator.

To invite someone to a server workspace, open **Manage members** beside the workspace selector, enter their registered username, choose **viewer**, **editor**, or **owner**, and select **Send invitation**. Usernames are case-insensitive. When the recipient signs in to the same server, **Invitations** appears on their start screen or in their library sidebar. Accepting opens the workspace. A pending invitation grants no access. The recipient can decline and the owner can revoke it before acceptance. Public registration can stay closed when inviting existing accounts.

Workspace owners also use **Manage members** to change an existing member’s role or remove them. Promote another owner before stepping down as the last owner. Removing a member or changing them to viewer interrupts agent turns they started in that workspace, including background tasks. Signing out interrupts turns started in that session.

For a shared access-key library, run the following from this directory. Enter the editor key in the browser at `http://127.0.0.1:4173`. On a fresh server, an editor creates the first workspace after signing in. A viewer sees the empty workspace list until one is available. A separate viewer key grants read and download access. Choose private random keys for your own installation.

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

For a named-account Docker deployment, build the same image and create the volume above. Before starting the service container, bootstrap the administrator in that volume:

```bash
read -rsp 'First administrator password: ' admin_password && echo
printf '%s' "$admin_password" | docker run --rm -i -v chulane-poc-data:/data chulane-poc \
  node dist-host/web/main.mjs create-admin operator
unset admin_password
docker run -d --name chulane-server -p 127.0.0.1:4173:4173 -v chulane-poc-data:/data chulane-poc
```

The Dockerfile copies the built app and the portable Mastra dependencies produced by `pnpm docker:prepare` from the same pnpm lockfile. The application serves HTTP. These commands bind it to loopback. Network deployment needs HTTPS termination. Both keys apply to every key-backed workspace on this instance. Named-account workspaces have separate membership checks. Managed installations use **Server settings** to enable sign-up.

## Try the product

1. Create a workspace, add a project with the plus beside **Projects**, and create a page. Type in its first paragraph. Click outside the writing surface or tab to another control to save your changes. Clicking a library destination saves first and then opens it. **Save now** and the single autosave five minutes after opening are also available. Edits sync to other open clients every 500 ms. A normal server shutdown saves the live edits it has received. Wait for **Saved** before closing a tab to ensure its latest edit reached storage. Once **Saved** appears, switch to **Canvas**, then return to **Page**. Use **Page actions → Link to page** to add another page from the workspace. The link appears under the title in both Page and Canvas, follows the target through renames and project moves, and becomes available again when a trashed target is restored. Use **Page actions** to rename, move, attach, export, or trash the page. The sidebar’s **Pages** list switches directly between documents in the current view.
   To add a task, type `todo Collect samples` in a paragraph and click the page title. Click the task status to cycle through **todo**, **doing**, and **done**. You can edit its name, description, and priority. Markdown export keeps the task name, description, and completion checkbox. Workflow details such as priority remain in the Chulane document.
   For a structured layout, type `/table`, `/columns`, `/kanban`, or `/bento` in an empty paragraph and select the matching command. A table starts with three rows and three columns. In Columns, click an empty column to write. In Kanban, use the plus under a column to add a card. Use a workspace backup to preserve the full layout when transferring it.
2. Select a project and use **New subproject** to nest projects. **Trash project** moves the selected tree and its pages to Trash. Restore the project there to recover its folders and documents together. Previously trashed pages and subprojects keep their separate trash state.
3. Return to **All pages** and search for a word from the body. Import a Markdown file to edit nested bullets, checkboxes, and numbered lists starting at one in the page, or open **Journal** to write directly in stacked daily pages. Viewers can open **Journal** first and use **Open today** to read the shared entry for the workspace date. **Earlier entries** loads more days, and the arrow beside a date opens that page on its own. The agent uses the last focused entry as its current document. Choose a time zone when creating a workspace. On desktop, use the globe in **Journal** to change it later. If the desktop loses its server connection, **Open today** uses the device clock in the workspace time zone. Previously opened days remain editable and synchronize on reconnect. Days whose documents have never been downloaded are marked **Online only**. Open **Journal** on a disconnected desktop to start a new day in the stack. The device keeps the entry through restart. When you reconnect with editing access, Chulane merges it into the workspace page for that date, including edits from other devices. Existing journal dates keep their page IDs. Workspaces upgraded from the earlier schema start in UTC. Paste or drop a file into a page, choose the editor’s **/File** command, or use **Attach** in the page toolbar. Open the saved attachment to download its original bytes and filename. Attachment names preserve Unicode, punctuation and spacing. The download manager may adapt the suggested name to the destination filesystem. Trash and restore a page from the library. In **Trash**, a workspace owner can choose **Delete permanently** beside a page and confirm. This removes its content, files and tag assignments. Its page ID and journal date stay reserved so older links and offline retries cannot recreate it. When a desktop learns of the deletion, **Deleted page copies on this device** offers export and discard for retained data. Export includes the available Yjs document, readable text, pending edits and locally stored attachment bytes. Export keeps the copy. Discard requires confirmation and removes it from that device.
4. In a writing block, type a space followed by `#` and a name, or begin the block with `#name`. **Space** applies the name you typed. Use **↑/↓** and **Enter**, or click a suggestion, to complete an existing name. **Escape** keeps the text literal. Typing an existing accented name such as `#Café` finds the same tag whether the keyboard enters the accent separately or together with the letter. If that name is in Trash, choose **Restore #Café** to recover its assignments and field values and apply it to this block. To manage assignments, open the hash icon under a page title. Choose **Whole page** or a writing block, define a tag, then check its name to apply it. **Tags** in the sidebar lists the tagged pages and blocks. Open a tag and choose **Show field table → Manage fields** to create a column or attach an existing workspace field. Edit values in the table, click a column header to sort, or type in its filter. Detaching a field hides its column. Attaching the same field restores the values. Restore a trashed tag in **Trash** or define its name again to recover its applications and values.
5. On web, open independent browser sessions using the same editor key. Open one page in both and edit it. With a viewer key the server permits reads and rejects writes. Desktop has its own database.
6. On desktop, open the native **Plugins → Install from folder…** menu and choose `examples/reading-break`. Confirm the displayed source. In an empty paragraph, type `/reflection` and choose **Reflection**. Write a note. Disable the plugin from the native menu to see the saved text in Rivto’s unsupported-block placeholder. Enable it again to resume editing. Removing and reinstalling the same compatible plugin also restores the block. The plugin contributes the native **Reading break…** command as well. Keep the folder in place while installed.

If a previously enabled plugin folder is missing when Chulane starts, open the notebook normally. Its saved blocks show their fallback content. Under **Plugins**, the unavailable entry shows the startup error. Restore the folder at its original path, then choose **Retry**. Choose **Disable** to stop loading that folder on startup.

To create a plugin from a local desktop workspace, open **Agent**, select **Suggest edits** and ask for a plugin, for example “Create a Field note writing block for the slash menu.” Expand the filenames in the reply to inspect the source. Choose **Save plugin folder** and select its parent directory. Chulane writes a new folder and shows its path before asking whether to run the plugin. Choosing **Cancel** at that prompt keeps the files for later inspection or installation. Native plugins run with your desktop account permissions. The draft stays in the conversation after restart. Ask a follow-up to explain either file or revise the plugin. Each revision appears as a new draft with its own save control.

Use **Import Markdown** in a project to create a new page there. Standalone Markdown thematic breaks open as Rivto dividers and export as `---`. An unordered checklist with one line per item opens as individual checkbox blocks. Toggle a box before exporting to save its current state in Markdown. Reference links and images stay in the same editable block as their definitions. Choose **Page actions → Markdown** to download the current writing. A **Linked pages** section includes current target titles. Server exports link back to the original workspace. Local desktop exports record workspace and page IDs because the desktop host address changes between launches. Trashed targets are identified in the list. Reimport keeps these references as document content. The export notification lists omitted data, including editable link relationships and saved tag field values. A workspace backup preserves those values.

## Talk to the built-in agent

Open **Agent** in the workspace toolbar on desktop or web. The sidebar shows which document the next message will use and that the chat is shared. Sending a message checkpoints that document first. In the composer, **Ask only** allows search, project browsing and reading. For example, ask “Which pages are in Field research, and what does the Roadmap page say?” The agent can follow nested projects and read a page by its ID to cite it. **Suggest edits** also lets the agent propose a change for your approval. The choice is kept for this workspace in the current tab, including reloads. You can also start from the library with no page open. To include up to three other pages in a message, drag each page by its grip into the composer or choose **Add page** and search by title. Sent messages keep links to the pages you included. To discuss particular blocks, select them in the editor, then drag the link icon beside any selected block into the composer. Dragging a single block’s link icon also works. Each chip links to its original block and can be removed before sending. The agent can propose a revision directly from a complete linked block. For longer blocks, the preview includes the exact offset to continue reading, including when the text contains emoji. You can ask “Revisit the second block I attached earlier.” Even after the original prompt leaves the recent conversation, the agent can look up its page and block links in this chat and read their current text. The reply keeps links to these source blocks when the chat is reopened. Opening a saved link scrolls to the block, including in a new browser tab. If the page or block is unavailable, Chulane reports it and keeps the citation in the conversation.

**Search pages** and the workspace agent can search inside UTF-8 text, Markdown, CSV, and TSV attachments (`.txt`, `.md`, `.markdown`, `.csv`, and `.tsv`). Search reads tabular files as text and preserves the original delimiters and download bytes. Ask “What does the end of the attached dispatch.md say?” The agent can list readable files on a page, jump directly to a matching passage in a large attachment, and continue reading from there. Agent search returns up to 30 sources per query. It includes one result per matching page first, then additional matching files on those pages. Each file result includes its filename and a short passage. In a follow-up message, ask the agent to reopen a cited file by name. The agent can also look up files cited in older replies in the same conversation, including after a restart. It uses the saved file ID and search position to read the passage again. The attachment citation in chat downloads the original file. If the source is in Trash, the citation stays visible. Once a named-server desktop receives that deletion response, it also blocks ordinary offline reads of the cached page and attachments. A restored page becomes available again on the next library refresh. Updated servers send a revision for each move to Trash or restoration, including project-wide changes, so delayed responses cannot reverse a newer decision on the desktop. Other formats remain available through the page’s attachment list.

Chats belong to the workspace. In a named-account workspace, the author or an owner can use **Delete conversation** in the sidebar. Confirming stops an active response and removes its history, tasks, and edit proposals. Page edits already applied remain in the document. Removing an author from the workspace preserves their conversations for remaining members. In a shared-key workspace, users of the editor key share the same author identity.

### Connect Codex on desktop

1. Install the CLI with `npm install -g @openai/codex` if needed. Run `codex login status` and use `codex login` if you need to sign in.
2. From that terminal, run `pnpm desktop`. Open **Agent → Use local codex** on first use. If another provider is already configured, open **Provider settings** and select **Local Codex** first.
3. Open a page, select several blocks, and drag their link handle into chat. With the keyboard, focus the **Attach block links to chat** button on a selected block and press **Enter**. The composer receives focus with the block links attached. Choose **Suggest edits**, ask for a revision, inspect the target and replacement, then choose **Apply**. Chulane remembers your provider selection on this device. [Codex non-interactive mode](https://developers.openai.com/codex/noninteractive)

To use a different agent for one desktop conversation, open that chat (or choose **New chat**) and select **Agent for this chat** below the composer. Pick **Codex**, **Claude Code**, or **Hermes**. The next message sends the recent conversation and selected context to that agent. The chat remembers your choice after restarting Chulane. Choose **Device default** to follow Provider settings again. Hosted workspaces use the provider configured on their server.

Applying a paragraph edit opens its destination page if needed. While that editor is open, focus the writing and use the editor’s usual Undo shortcut to reverse the change.

Ask “Was that edit approved?” to check earlier proposals in the same conversation, including after restart. The agent can open the resulting document or read its current contents. In **Suggest edits**, ask the sidebar to draft a new page in a named project. Review its title, destination and Markdown, choose **Create page**, then follow **Open page** to edit it in Rivto.

For a first edit, drop two block links into the composer and ask “Shorten the first paragraph using the second as context.” Both blocks stay in the document. Check the block link in the proposal before applying it.

Import a Markdown pipe table to edit its cells in Rivto. Short rows receive empty trailing cells. Tables with extra cells or very sparse rows keep their Markdown source. **Page actions → Markdown** exports single-line cells as a pipe table, using the first row as the header. Column widths are omitted. Imported tables with explicit alignment keep their Markdown source. Tables containing nested blocks export their readable contents with a formatting warning.

Search for a phrase to see its matching paragraph, canvas label, or canvas group title. Agent search can cite several matching blocks on the same page and a matching canvas passage alongside them. Follow a citation to open that block, even after reopening the chat. You can also ask “Show me that paragraph.” The foreground agent can open the cited block or canvas in your editor and continue discussing it. Ask “Reopen the canvas you cited” to return to that view from a later turn. For a block from an earlier answer, ask the agent to revisit it. It can look up the saved citation and read the block’s current text. Online library and agent searches include edits that an open editor has already sent to the host, even before the next save. An open library search refreshes as collaborators edit. Markdown export includes canvas labels and group titles after the writing blocks and reports the omitted canvas layout and objects. Canvas search matches open the document in **Canvas** view, including from a saved chat citation or a search on a disconnected desktop. The sidebar previews up to 4,000 characters of canvas labels. For a long writing block or canvas label, the agent can jump from a search excerpt to the matching passage, read further in chunks, and cite the source. A block replacement requires reading the complete target before proposing the change. If someone edits it during the agent’s turn, the agent can reread the block and prepare a fresh proposal in that same turn. Following a block citation in chat opens Page view at that paragraph, including from Canvas or after reopening the chat. A citation stays in history when its page goes to Trash. Restoring the page makes the same link usable again.

In a shared workspace, approval checks the current permissions of the member who started the turn, even when someone else created the chat. If that member loses write access, an editor can dismiss the pending suggestion. Older named-account suggestions without a recorded requester need a fresh turn.

To work across documents, ask for a page by its project path, for example “Shorten the introduction in Research / Field notes.” To rename a page, ask “Rename Research / Field notes to Coastal observations.” Check the old and new titles and choose **Apply**. If the title changes during review, ask for a fresh proposal. To create a project, ask “Create Expeditions under Research,” review the proposed parent, and select **Create project**. To rename one, open its folder and choose the pencil beside its heading, or ask “Rename Research / Expeditions to Fieldwork.” The sidebar shows the parent, project ID, and old and new names for review. Renaming a project updates descendant paths and preserves its pages and links. Project renames require a connection to the workspace host.

On Linux and macOS, Chulane checks the launch PATH, `~/.local/bin`, and Homebrew’s bin directory. A configured `HOMEBREW_PREFIX` takes precedence over the platform’s default Homebrew location. For a different installation directory, point the host at the executable. Its directory is also available to the CLI so a launcher can find an adjacent runtime such as Node. For example, launch it from the terminal where Codex works:

```sh
CHULANE_CODEX_PATH="$(command -v codex)" pnpm desktop
```

On Windows x64 or Arm64, sign in with `codex login` and choose **Local Codex** in the sidebar. Chulane first tries the executable on PATH. For global npm installs it also checks for the native executable behind `codex.cmd` in PATH directories and the default user npm directory. For a custom npm prefix, launch from PowerShell:

```powershell
$env:CHULANE_CODEX_PATH = (Get-Command codex.cmd -ErrorAction Stop).Source
pnpm desktop
```

An absolute path to `codex.exe` also works. The same override works on the web host. Use `CHULANE_CLAUDE_PATH` or `CHULANE_HERMES_PATH` for the other providers. Each value is one absolute executable path, including any spaces. Choose the provider in the sidebar as usual.

**Claude Code and Hermes.** The same selector offers **Local Claude Code** and **Local Hermes**. Install and sign in to the corresponding CLI before selecting it. For Claude Code, run `claude auth login`, then select **Use local claude**. Chulane checks `claude --safe-mode auth status` before saving the connection. For Hermes, select **Use local hermes**. Chulane checks the installed chat command for the required safe mode, stdin input, and structured output options. Sending your first message exercises the configured model provider. Hermes runs in safe mode. On Linux, Hermes 0.21.5 completed a Chulane search with an OpenAI-compatible Responses endpoint configured in the host environment through `HERMES_INFERENCE_PROVIDER=openai-api`, `OPENAI_BASE_URL`, and `OPENAI_API_KEY`. Use these settings if your provider is configured only in Hermes config.yaml and the connection check succeeds but chat fails. The local runners can request page searches, reads and edit proposals. A message returned with a tool request appears in chat before the next step. Stopping a foreground turn or reloading its window keeps the text already shown and marks the reply as interrupted. [Local adapter](src/server/local-agent.ts) · [Claude Code CLI](https://code.claude.com/docs/en/cli-reference) · [Hermes CLI](https://hermes-agent.nousresearch.com/docs/reference/cli-commands)

**Local browser host.** Run `CHULANE_LOCAL_AGENT=codex pnpm web` with your normal Chulane editor key configured. Supported values are `codex`, `claude` and `hermes`. The executable and credentials belong to the server OS user. Enabling it lets all editors of that installation use that account. The sidebar cannot choose an executable path or switch the server's agent.

**API connection.** On desktop, enter an OpenAI API key and model in **Agent → Provider setup → Connection → OpenAI API key** (use **Provider settings** to switch an existing connection). The device shares this setting across local workspaces. The host encrypts the key with Electron safeStorage when a secure OS backend is available. Otherwise, it holds the key until quit and tells you to configure it again next time. The chat database and its backup contain no provider key.

For environment-based web configuration, set `OPENAI_API_KEY` in the server process environment before `pnpm web`. Set `CHULANE_AI_MODEL` to a tool-capable OpenAI model available to the configured account. Model IDs containing `codex` use the Responses API. Other model IDs use Chat Completions. The default is `gpt-4.1-mini`. Pass the same variables to Docker with `-e OPENAI_API_KEY -e CHULANE_AI_MODEL`. Host environment values also work on desktop. A Codex CLI login is separate from the provider API key. Messages and selected page excerpts go to the configured provider. All editors on this installation share its provider usage.

1. From *Meeting notes*, ask “Find Roadmap and add a paragraph summarizing the launch decision from this page.”
2. Inspect the target page and the before/after text in the chat. **Apply** records the change and **Dismiss** closes the proposal. **Open page** goes to the target. If the response is lost, Chulane checks the proposal record. It shows the saved decision or tells you when the proposal is still pending. If the host is unreachable, check the target and proposal status after reconnecting. If the original block changed during review, dismiss the stale proposal and request a revision.
3. Ask “Open Roadmap in my editor and summarize it.” The agent can bring an accessible page into the window that sent the message and continue in the same chat. Background tasks leave your current page in place. You can also switch pages yourself and continue the conversation. **Stop response** cancels a turn. Closing the browser tab or desktop window interrupts an ordinary turn. Select the clock (**Run in background**) before sending to keep that turn running on the host. Open **Background tasks** to see its state, jump to the answer, or cancel it. Proposed edits wait for review. After an unexpected host exit, open **Background tasks → Outcome unknown** to inspect the saved message and proposals. Check the target page or project before making another request. A proposal marked **applied** already took effect. A pending proposal still needs a decision. A viewer can read shared history.

Run `pnpm smoke:agent` after building for a repeatable Chromium and Linux Electron check using a local scripted provider. With your local login, run `CHULANE_LOCAL_AGENT=codex pnpm smoke:agent:live` (or select `hermes` or `claude`). With an API key, run `pnpm smoke:agent:live`. Build the app and install the Playwright Chromium browser before running the live check. It opens the sidebar in **Ask only**, asks the provider to read a synthetic receipt, and follows its citation. A separate account has an inaccessible receipt with the same title. Further turns exercise a cross-page paragraph edit, a reviewed page rename and a desktop plugin draft. The live check leaves the generated source unexecuted. It uses the configured provider and can incur API charges.

## Access from a tool

To select a tool profile, set its server origin, credentials, and optional workspace ID in the process environment. For a shared-key workspace, use its access key. For example, from the POC directory:

```sh
export CHULANE_PROFILE_RESEARCH_URL=http://127.0.0.1:4173
export CHULANE_PROFILE_RESEARCH_ACCESS_KEY="$CHULANE_EDITOR_KEY"
export CHULANE_PROFILE_RESEARCH_WORKSPACE=1
node src/tools/cli.ts --profile research projects
node src/tools/cli.ts --profile research browse root
node src/tools/cli.ts --profile research propose_create "Reading list"
node src/tools/cli.ts --profile research propose_draft root "Trip notes" "Pack the notebook."
```

Use `browse` to see the folders and ordinary pages at the root. Run `browse PROJECT_ID` to look inside a folder. Each batch contains up to 40 entries. If it returns a numeric `nextOffset`, pass it as the next argument, for example `browse 7 40`. The MCP `browse` tool accepts the same project and offset. For a draft in a folder, replace `root` with its numeric ID. The review shows its full path and ID. If someone renames the folder or one of its ancestors, pending sidebar and external requests show the updated destination beside the original. Approving records the path you saw. If it changes again before approval, review the refreshed path and retry the same request. MCP clients can send `title`, `project` (ID or null), and `markdown` to `propose_create`. An editor reviews the destination and Markdown before approving. The completed request and its page link appear in **Tool request history**.

For a workspace owned by a named account, use that member’s server username and password. Set the workspace ID to one listed by the first command. Account sign-in accepts HTTPS and loopback HTTP.

```bash
export CHULANE_PROFILE_TEAM_URL=https://chulane.example.org
export CHULANE_PROFILE_TEAM_USERNAME=researcher
read -rsp 'Chulane password: ' CHULANE_PROFILE_TEAM_PASSWORD && echo
export CHULANE_PROFILE_TEAM_PASSWORD
node src/tools/cli.ts --profile team workspaces
export CHULANE_PROFILE_TEAM_WORKSPACE=2
node src/tools/cli.ts --profile team projects
```

With either the CLI or MCP, a reader can search and read. Editors and owners can propose changes. The review shows the requester’s account and profile. Decision history also names the account that approved or dismissed the proposal. Shared chat shows who sent each prompt and who reviewed each suggested edit. Historical decisions and reviews made with a shared key have no reviewer name. Approving a named-account proposal checks that the requester still has write access. If a named workspace has a pending request from an older installation that did not record the requester, dismiss it and resubmit from the member’s profile. The same account settings work in the default profile with `CHULANE_USERNAME` and `CHULANE_PASSWORD`.

Use `--profile research` in the MCP process arguments or set `CHULANE_PROFILE=research` when starting the CLI, MCP or Harness. The command-line choice takes precedence. A named connection uses only its own settings and defaults to workspace 1. To configure a second connection, use another uppercase prefix and select the corresponding lowercase name. Supply secrets through the process environment or your secret manager. Each review displays the connection label supplied at login. For key-backed workspaces, the server key determines permissions. Multiple profiles can share that key.

Set `CHULANE_URL`, `CHULANE_ACCESS_KEY`, and `CHULANE_WORKSPACE` in the calling process. The default URL is the loopback web service and the default workspace ID is 1. The access key can be either configured web key. Tools authenticate at the same service as a browser.

```sh
export CHULANE_URL=http://127.0.0.1:4173 CHULANE_ACCESS_KEY="$CHULANE_EDITOR_KEY" CHULANE_WORKSPACE=1
node src/tools/cli.ts workspaces
node src/tools/cli.ts projects
node src/tools/cli.ts search observation
node src/tools/cli.ts read 1
node src/tools/cli.ts propose_create "Reading list"
node src/tools/cli.ts propose_rename 1 "Field observations"
node src/tools/cli.ts propose_edit 1 "" "" "Append this paragraph."
```

For a long block or canvas search hit, use `read_text PAGE OFFSET [BLOCK]` with the result’s `readFrom.offset` and `readFrom.block`. Omit the block argument for canvas labels. The response includes a source URL and up to 12,000 UTF-16 code units. Pass `nextOffset` to continue. The MCP `read_text` tool accepts the page `id` and the two fields from `readFrom`.

Use `read_attachment PAGE` to list a page’s readable files. To follow a search result, run `read_attachment PAGE FILE MATCH_OFFSET` using its attachment ID and `matchOffset`. The returned passage includes the original download URL. Pass `nextOffset` to continue. MCP exposes the same operation with `id`, `file`, and `offset`. Use a null file ID to list attachments.

For a replacement, run `read ID` and copy a block’s ID and exact text into `propose_edit ID BLOCK BEFORE AFTER`. The tool accepts up to 12,000 UTF-16 code units of original text and 32,000 of replacement text. Review shows both versions. A changed target requires a fresh proposal.

An editor sees the proposed action in the workspace and chooses **approve** or **dismiss**. An approval transaction records the decision and applies the change. The CLI returns the pending request ID. Use `node src/tools/cli.ts proposal_status REQUEST_ID` with the same profile to check its outcome and target link after reconnecting. After a decision, editors can open **Agent → Tool request history** to find that ID, see the decision and profile, inspect the requested text, and follow the recorded page or block link. History survives restart.

The same tools are available through DeepSeek Harness. Start the Chulane web service, configure a tool profile in a second terminal (set `CHULANE_PROFILE` to its name), and run these commands from the POC directory. Use Node 24.9 or later with this Harness release.

```sh
export CHULANE_MCP_ENTRY="$PWD/src/tools/mcp.ts"
npx @deepseek-ai/dsh@0.2.2-rc.5 web --patch "$PWD/examples/chulane.cordis.yml" --no-open
```

Open the Harness address printed by the launcher. In a profile with a configured model, ask it to list a folder with `mcp__chulane__browse` or search the library with `mcp__chulane__search`. Chulane source links open the corresponding document in the browser. A matching text attachment also has its own download link in `attachment.url`. Opening that link requires access to the workspace. Choose the viewer key for read-only access. A proposal made with an editor key still requires approval in Chulane. [Runnable Harness overlay](examples/chulane.cordis.yml) · [Upstream MCP configuration](https://github.com/deepseek-ai/deepseek-harness/tree/2e39e70496aa02986ca6a820c5d497e816b69d7e/packages/mcp/mcp-client)

## Backup and restore

Wait for **Saved** on each document you want to include. The backup also captures live edits the host has already acknowledged. On restore, Chulane recovers those edits before opening the library. In a server workspace, finish syncing device edits first. Use the workspace snapshot command with Node 24 from the POC directory. It captures one consistent SQLite revision while the host is running, including workspace settings, users, roles, pending invitations, documents, attachments, trash, chat history and pending decisions. The output is a private file containing readable workspace data. Choose a new filename each time.

| Host | Source database |
|---|---|
| Web | `$CHULANE_DATA/workspace.sqlite`, default `./data/workspace.sqlite` relative to the launch directory |
| Docker | `/data/workspace.sqlite` inside the service container |
| Desktop | `workspace.sqlite` in Electron’s `app.getPath('userData')` directory. Usual bases are `$XDG_CONFIG_HOME` or `~/.config` on Linux, `~/Library/Application Support` on macOS and `%APPDATA%` on Windows. |

**Local desktop backup.** Once the document shows **Saved**, choose **File → Back up local workspaces…** and select a new filename. The snapshot includes every local workspace in the running desktop profile. Connected server workspaces use their server’s backup. To open a copy independently, copy the snapshot into an empty folder as `workspace.sqlite`, then run the following from the POC directory, supplying that folder’s absolute path:

```sh
pnpm desktop --user-data-dir="/absolute/path/to/restored-profile"
```

For example, to back up the default web service and start an independent restore on port 4174:

```sh
restore_dir="$(mktemp -d)"
pnpm backup ./data/workspace.sqlite "$restore_dir/workspace.sqlite"
pnpm backup --verify "$restore_dir/workspace.sqlite" &&
  CHULANE_DATA="$restore_dir" PORT=4174 pnpm web
```

Use `pnpm backup --verify <snapshot>` after copying a backup to check its workspace format, installation identity, SQLite integrity and foreign keys. The command opens the file read-only and exits with a failure status if a check fails.

Current snapshots use Chulane workspace format 2. Starting the host upgrades an unversioned or format-1 database and indexes existing CSV and TSV attachments. A format-1 host rejects an upgraded database. Before upgrading, keep a backup made with the previous release. If verification reports a newer format, use the Chulane release that produced the snapshot or a release supporting that format. To roll back, restore the pre-upgrade snapshot with its matching release.

The destination directory must already exist and support hard links. If your archival storage lacks hard-link support, create the snapshot on a local disk and copy the completed file there. To restore an existing snapshot, copy it into an empty service data directory as `workspace.sqlite` and point `CHULANE_DATA` there. For local desktop workspaces, quit Chulane and restore the snapshot into a fresh desktop profile under that same filename. The snapshot excludes local server sessions, plugin source folders and the desktop provider file.

**Docker restore drill.** Run these commands on the Docker host, using the image version that created the backup. The source container is named `chulane-poc` in the setup example. Select a fresh volume and container name for the restore. The example restores named accounts. For shared-key access, add `-e CHULANE_EDITOR_KEY -e CHULANE_VIEWER_KEY` to the restored server command with the desired keys exported in your shell. Each block assumes the preceding block succeeded.

```sh
backup_dir="$(mktemp -d)"
snapshot_dir="$(docker exec chulane-poc mktemp -d)"
docker exec chulane-poc node src/tools/backup.ts /data/workspace.sqlite "$snapshot_dir/workspace.sqlite"
docker cp "chulane-poc:$snapshot_dir/workspace.sqlite" "$backup_dir/workspace.sqlite" &&
  docker exec chulane-poc rm "$snapshot_dir/workspace.sqlite" && docker exec chulane-poc rmdir "$snapshot_dir"
```

```sh
docker volume create chulane-restore-data
docker run --rm -i -v chulane-restore-data:/data chulane-poc \
  sh -ec 'test -z "$(ls -A /data)"; umask 077; cat > /data/workspace.sqlite' < "$backup_dir/workspace.sqlite"
docker run --rm -v chulane-restore-data:/data:ro chulane-poc \
  node src/tools/backup.ts --verify /data/workspace.sqlite &&
docker run -d --name chulane-restore -p 127.0.0.1:4174:4173 \
  -v chulane-restore-data:/data chulane-poc
```

Sign in at `http://127.0.0.1:4174` with an existing named account. Check its workspace role and journal time zone, open a known document and download an attachment to compare with the original. For a shared-key installation, supply the desired `CHULANE_EDITOR_KEY` and `CHULANE_VIEWER_KEY` to the new process or container. Managed installations restore the registration policy and administrator from the snapshot. For installations without an administrator, reapply the deployment’s `CHULANE_ALLOW_REGISTRATION` value. Existing named accounts can sign in with registration closed.

**Reconnect the agent.** Open **Agent** on the restored host. For a connection managed in **Server settings**, sign in as the administrator and re-enter the API key under **Shared AI provider**. The model survives restore. The host stores each credential in a private file beside the database. The snapshot command excludes these files. For an environment-based connection, supply `OPENAI_API_KEY` again through the host secret configuration and restore `CHULANE_AI_MODEL` and any custom `CHULANE_OPENAI_BASE_URL` before starting the service. For Docker, pass these variables with `-e` when creating the restored container. For a local CLI, install and sign in as the new host’s OS user and set `CHULANE_LOCAL_AGENT`. On desktop, use **Agent → Provider settings**. Send a read-only question about a known page to verify the connection. The original provider credentials stay outside the snapshot.

## Verification

```sh
pnpm check-types
pnpm test
pnpm exec playwright install chromium
pnpm smoke
pnpm smoke:servers
pnpm smoke:plugins
```

Build before running smoke. `pnpm exec tsx tests/e2e/hosts.spec.ts web` and `pnpm exec tsx tests/e2e/hosts.spec.ts desktop` exercise the hosts independently. The tests use temporary profiles and databases. The desktop plugin check supplies a temporary test answer to Electron's native folder and confirmation dialogs.

To exercise the published Harness executor without a provider account, run this optional smoke from the POC directory. It installs the pinned launcher through npm, uses a disposable profile, and asserts the page link returned by a real tool call.

```sh
npm exec --yes --package=@deepseek-ai/dsh@0.2.2-rc.5 -- pnpm exec tsx tests/e2e/harness.spec.ts
```
