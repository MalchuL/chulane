/** Public workspace navigation controls and their data contracts. */
export { FileTree } from "./file-tree/index.js";
export type { FileTreeProps } from "./file-tree/index.js";
export { NavigationTree } from "./navigation-tree/index.js";
export type {
  NavigationItem,
  NavigationItemKind,
  NavigationTreeProps,
} from "./navigation-tree/index.js";
export { createDefaultSidebarPreferences, Sidebar } from "./sidebar/index.js";
export type {
  SidebarDestination,
  SidebarMode,
  SidebarPreferences,
  SidebarProps,
  SidebarSection,
} from "./sidebar/index.js";
export { WorkspaceSwitcher } from "./workspace-switcher/index.js";
export type { WorkspaceOption, WorkspaceSwitcherProps } from "./workspace-switcher/index.js";
