/** Shared host data and interaction contracts for hierarchical navigation. */
import type { ComponentProps } from "react";
import type { MenuEntry } from "../../commands/types.js";

/** Content categories used to choose an item's icon. */
export type NavigationItemKind = "project" | "page" | "collection" | "conversation";

/** A host destination or branch with a stable identity. */
export type NavigationItem = {
  /** Stable ID used for selection and expansion. */
  id: string;
  /** Visible destination name. */
  label: string;
  /** Icon category. Defaults to a page for leaves and a folder for branches. */
  kind?: NavigationItemKind;
  /** Child destinations. Omit for a leaf. */
  children?: readonly NavigationItem[];
  /** Destination URL, if the host provides one. The host handles navigation. */
  href?: string;
};

/** Host data and optional controlled expansion for a navigation tree. */
export type NavigationTreeProps = Omit<ComponentProps<"ul">, "children"> & {
  /** Root items in display order. */
  items: readonly NavigationItem[];
  /** Selected item ID. Omit when no item is selected. */
  selected?: string;
  /** Opens an item and gives the host its selected ID. */
  onSelectedChange: (id: string) => void;
  /** Supplies extra actions for an item. Defaults to no extra actions. */
  actions?: (item: NavigationItem) => MenuEntry[];
  /** Expanded branch IDs. Omit to let the tree manage expansion. */
  expanded?: readonly string[];
  /** Initially expanded branch IDs in uncontrolled mode. Defaults to an empty list. */
  defaultExpanded?: readonly string[];
  /** Receives the next expanded branch IDs after a disclosure changes. */
  onExpandedChange?: (ids: string[]) => void;
};
