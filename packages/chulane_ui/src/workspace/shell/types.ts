/** Public slots and controlled values for the workspace shell and its panel renderer. */
import type { ComponentProps, ReactNode } from "react";
import type { SidebarMode } from "../../navigation/sidebar/types.js";

/** Shell-built panes for a host-provided layout or resize implementation. */
export type WorkspacePanels = {
  /** Effective sidebar mode, including the compact rail below the shell breakpoint. */
  sidebarMode: SidebarMode;
  /** Sidebar pane, or null when hidden. */
  sidebar: ReactNode;
  /** Scrollable main pane, including the optional split view. */
  main: ReactNode;
  /** Docked agent pane, or null when hidden or presented in a dialog. */
  agent: ReactNode;
};

/** Content, controlled layout and root div props for WorkspaceShell. */
export type WorkspaceShellProps = Omit<ComponentProps<"div">, "children"> & {
  /** Sidebar content or a renderer that receives whether the shell is compact. */
  sidebar: ReactNode | ((compact: boolean) => ReactNode);
  /** Main workspace content. */
  main: ReactNode;
  /** Agent content or a renderer that receives a function to close its current presentation. */
  agent: ReactNode | ((close: () => void) => ReactNode);
  /** Optional second document displayed beside main in split view. Defaults to absent. */
  secondaryMain?: ReactNode;
  /** Optional host controls displayed in the shell header. Defaults to absent. */
  toolbar?: ReactNode;
  /** Preferred sidebar mode above the compact breakpoint. */
  sidebarMode: SidebarMode;
  /** Whether the sidebar is open when focus mode is off. */
  sidebarOpen: boolean;
  /** Requests a change to sidebar visibility. */
  onSidebarOpenChange: (open: boolean) => void;
  /** Whether the agent is docked above the compact breakpoint when focus mode is off. */
  agentOpen: boolean;
  /** Requests a change to docked agent visibility. */
  onAgentOpenChange: (open: boolean) => void;
  /** Whether side panes are hidden to prioritize the main pane. */
  focusMode: boolean;
  /** Requests a change to focus mode. */
  onFocusModeChange: (focusMode: boolean) => void;
  /** Whether to display the secondary document when provided. */
  splitView: boolean;
  /** Requests a change to split view. */
  onSplitViewChange: (splitView: boolean) => void;
  /** Preferred sidebar width in CSS pixels. Defaults to the token for the current sidebar mode. */
  sidebarWidth?: number;
  /** Preferred docked agent width in CSS pixels. Defaults to the agent width token. */
  agentWidth?: number;
  /** Optional host layout for the built panes. Defaults to the shell's flex layout. */
  renderPanels?: (panels: WorkspacePanels) => ReactNode;
};
