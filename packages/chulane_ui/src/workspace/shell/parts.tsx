/** Internal shell header controls and scrollable document presentation. */
import { Columns2, Maximize, PanelLeft, PanelRight } from "lucide-react";
import type { ReactNode } from "react";
import { ScrollArea } from "../../components/ui/scroll-area.js";
import { ButtonGroup } from "../../foundation/button-group/button-group.js";
import { Dialog } from "../../foundation/dialog/dialog.js";
import { IconButton } from "../../foundation/icon-button/icon-button.js";
import type { WorkspacePanels, WorkspaceShellProps } from "./types.js";

/** Inputs shared by the shell header's layout controls. */
type HeaderControls = Pick<
  WorkspaceShellProps,
  | "toolbar"
  | "sidebarOpen"
  | "onSidebarOpenChange"
  | "focusMode"
  | "onFocusModeChange"
  | "splitView"
  | "onSplitViewChange"
  | "secondaryMain"
  | "agentOpen"
  | "onAgentOpenChange"
>;

/** Presentation of the header alongside the host's controlled values. */
type WorkspaceHeaderProps = {
  controls: HeaderControls;
  compact: boolean;
  agentContent: ReactNode;
  agentDialogOpen: boolean;
  setAgentDialogOpen: (open: boolean) => void;
};

/**
 * Render the toolbar and route agent controls to the docked pane or compact dialog.
 * @param props Host visibility controls and the current responsive agent presentation.
 * @returns The shell header.
 */
export function WorkspaceHeader(props: WorkspaceHeaderProps) {
  const { controls, compact, agentContent, agentDialogOpen, setAgentDialogOpen } = props;
  const headerClassName = "cu-shell-header";
  const spacerClassName = "cu-spacer";
  return (
    <header className={headerClassName}>
      <IconButton
        label="Toggle navigation"
        aria-pressed={controls.sidebarOpen}
        onClick={() => controls.onSidebarOpenChange(!controls.sidebarOpen)}
      >
        <PanelLeft />
      </IconButton>
      {controls.toolbar}
      <span className={spacerClassName} />
      <ButtonGroup label="Workspace layout">
        {controls.secondaryMain != null && (
          <IconButton
            label="Split view"
            aria-pressed={controls.splitView}
            onClick={() => controls.onSplitViewChange(!controls.splitView)}
          >
            <Columns2 />
          </IconButton>
        )}
        <IconButton
          label="Focus mode"
          aria-pressed={controls.focusMode}
          onClick={() => controls.onFocusModeChange(!controls.focusMode)}
        >
          <Maximize />
        </IconButton>
        <WorkspaceAgentControl
          compact={compact}
          dialogOpen={agentDialogOpen}
          onDialogOpenChange={setAgentDialogOpen}
          dockedOpen={controls.agentOpen}
          onDockedOpenChange={controls.onAgentOpenChange}
        >
          {agentContent}
        </WorkspaceAgentControl>
      </ButtonGroup>
    </header>
  );
}

/**
 * Show the compact dialog trigger or the desktop dock toggle.
 * @param props Agent content and the independent visibility controls.
 * @returns The agent control for the current shell width.
 */
function WorkspaceAgentControl({
  compact,
  dialogOpen,
  onDialogOpenChange,
  dockedOpen,
  onDockedOpenChange,
  children,
}: {
  compact: boolean;
  dialogOpen: boolean;
  onDialogOpenChange: (open: boolean) => void;
  dockedOpen: boolean;
  onDockedOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  if (compact) {
    return (
      <Dialog
        title="Workspace agent"
        open={dialogOpen}
        onOpenChange={onDialogOpenChange}
        trigger={
          <IconButton label="Open agent">
            <PanelRight />
          </IconButton>
        }
      >
        {children}
      </Dialog>
    );
  }

  return (
    <IconButton
      label="Toggle agent"
      aria-pressed={dockedOpen}
      onClick={() => onDockedOpenChange(!dockedOpen)}
    >
      <PanelRight />
    </IconButton>
  );
}

/** Host content and the presentation selected for the current width. */
type WorkspaceBodyProps = {
  content: Pick<
    WorkspaceShellProps,
    | "sidebar"
    | "sidebarMode"
    | "sidebarOpen"
    | "agentOpen"
    | "focusMode"
    | "main"
    | "secondaryMain"
    | "splitView"
    | "renderPanels"
  >;
  compact: boolean;
  agentContent: ReactNode;
};

/**
 * Build the visible panes before handing them to the host layout or default flex body.
 * @param props Workspace slots, effective sidebar mode and current presentation.
 * @returns The shell body with the chosen panel layout.
 */
export function WorkspaceBody({ content, compact, agentContent }: WorkspaceBodyProps) {
  const bodyClassName = "cu-shell-body";
  const sidebarClassName = "cu-shell-nav";
  const agentClassName = "cu-shell-agent";
  const sidebarMode = compact ? "compact" : content.sidebarMode;
  const panels: WorkspacePanels = {
    sidebarMode,
    sidebar:
      content.sidebarOpen && !content.focusMode ? (
        <aside data-mode={sidebarMode} className={sidebarClassName}>
          {typeof content.sidebar === "function" ? content.sidebar(compact) : content.sidebar}
        </aside>
      ) : null,
    main: <WorkspaceMain {...content} />,
    agent:
      content.agentOpen && !compact && !content.focusMode ? (
        <aside className={agentClassName}>{agentContent}</aside>
      ) : null,
  };
  return (
    <div className={bodyClassName}>
      {content.renderPanels ? (
        content.renderPanels(panels)
      ) : (
        <>
          {panels.sidebar}
          {panels.main}
          {panels.agent}
        </>
      )}
    </div>
  );
}

/**
 * Wrap each visible document in its own scroll area.
 * @param props Primary content, optional secondary content and split view state.
 * @returns The main pane ready for the shell or a host layout.
 */
function WorkspaceMain({
  main,
  secondaryMain,
  splitView,
}: Pick<WorkspaceShellProps, "main" | "secondaryMain" | "splitView">) {
  const mainClassName = "cu-shell-main";
  const splitClassName = "cu-split";
  return (
    <div className={mainClassName}>
      {splitView && secondaryMain != null ? (
        <div className={splitClassName}>
          <ScrollArea>{main}</ScrollArea>
          <ScrollArea>{secondaryMain}</ScrollArea>
        </div>
      ) : (
        <ScrollArea>{main}</ScrollArea>
      )}
    </div>
  );
}
