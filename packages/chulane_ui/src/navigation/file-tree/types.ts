/** A stable node ID represents a page, collection or project independently of its name. */
import type { NavigationTreeProps } from "../navigation-tree/types.js";
export type { NavItem as FileTreeNode } from "../sidebar/types.js";
export type FileTreeProps = NavigationTreeProps & {
  expandedIds?: readonly string[];
  onExpandedChange?: (ids: string[]) => void;
};
