/** Public data and callback contracts for shell. */

import type { ReactNode } from "react";
import type { SidebarMode } from "../../navigation/sidebar/types.js";
export type WorkspaceLayout = {
  navigation: boolean;
  agent: boolean;
  focus: boolean;
  split: boolean;
  navWidth?: number;
  agentWidth?: number;
};
export type WorkspacePanes = {
  mode: SidebarMode;
  navigation: ReactNode;
  main: ReactNode;
  agent: ReactNode;
};
export type WorkspaceShellProps = {
  layout: WorkspaceLayout;
  onLayout: (value: WorkspaceLayout) => void;
  mode: SidebarMode;
  renderPanels?: (panes: WorkspacePanes) => ReactNode;
  toolbar?: ReactNode;
  navigation: (compact: boolean) => ReactNode;
  agent: ReactNode | ((close: () => void) => ReactNode);
  children: ReactNode;
  secondary?: ReactNode;
};
