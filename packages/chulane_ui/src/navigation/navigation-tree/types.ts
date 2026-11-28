/** Public data and callback contracts for navigation-tree. */

import type { NavItem } from "../sidebar/types.js";
import type { MenuEntry } from "../../commands/types.js";
export type NavigationTreeProps = {
  items: NavItem[];
  selected?: string;
  onSelect: (id: string) => void;
  actions?: (item: NavItem) => MenuEntry[];
};
