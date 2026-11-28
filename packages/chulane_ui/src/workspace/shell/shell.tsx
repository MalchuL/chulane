/** Composes host-owned content into responsive workspace panes. */
import { cn } from "../../lib/utils.js";
import { useWorkspaceLayout } from "./hooks.js";
import { WorkspaceBody, WorkspaceHeader } from "./parts.js";
import type { WorkspaceShellProps } from "./types.js";

/**
 * Arrange a sidebar, a scrollable main pane and a workspace agent.
 *
 * The host owns content, docked visibility, focus and split state, and may supply
 * its own panel resizer. At or below the shell's inherited
 * `--ui-compact-breakpoint` (1100px by default), the sidebar becomes an icon rail
 * and the agent opens in a dialog with independent visibility. Widening the
 * shell closes that dialog and restores the host's docked preferences.
 *
 * @param props Workspace content, controlled values and root div attributes.
 * @returns The responsive workspace shell.
 * @example
 * ```tsx
 * function Workspace() {
 *   const [sidebarOpen, setSidebarOpen] = useState(true);
 *   const [agentOpen, setAgentOpen] = useState(true);
 *   const [focusMode, setFocusMode] = useState(false);
 *   const [splitView, setSplitView] = useState(false);
 *   return (
 *     <WorkspaceShell
 *       sidebar={<WorkspaceNavigation />}
 *       main={<Document />}
 *       agent={<WorkspaceAgent />}
 *       sidebarMode="standard"
 *       sidebarOpen={sidebarOpen}
 *       onSidebarOpenChange={setSidebarOpen}
 *       agentOpen={agentOpen}
 *       onAgentOpenChange={setAgentOpen}
 *       focusMode={focusMode}
 *       onFocusModeChange={setFocusMode}
 *       splitView={splitView}
 *       onSplitViewChange={setSplitView}
 *     />
 *   );
 * }
 * ```
 */
export function WorkspaceShell(props: WorkspaceShellProps) {
  const {
    sidebar: _sidebar,
    main: _main,
    agent,
    secondaryMain: _secondaryMain,
    toolbar: _toolbar,
    sidebarMode: _sidebarMode,
    sidebarOpen: _sidebarOpen,
    onSidebarOpenChange: _onSidebarOpenChange,
    agentOpen: _agentOpen,
    onAgentOpenChange: _onAgentOpenChange,
    focusMode: _focusMode,
    onFocusModeChange: _onFocusModeChange,
    splitView: _splitView,
    onSplitViewChange: _onSplitViewChange,
    sidebarWidth: _sidebarWidth,
    agentWidth: _agentWidth,
    renderPanels: _renderPanels,
    className,
    style,
    ...rest
  } = props;
  const shellClassName = "cu-shell cu-surface";
  const probeClassName = "cu-breakpoint-probe";
  const { breakpointProbe, panelWidths, closeAgent, ...presentation } = useWorkspaceLayout(props);
  const agentContent = typeof agent === "function" ? agent(closeAgent) : agent;
  return (
    <div {...rest} className={cn(shellClassName, className)} style={{ ...panelWidths, ...style }}>
      <span ref={breakpointProbe} className={probeClassName} aria-hidden="true" />
      <WorkspaceHeader controls={props} agentContent={agentContent} {...presentation} />
      <WorkspaceBody content={props} compact={presentation.compact} agentContent={agentContent} />
    </div>
  );
}
