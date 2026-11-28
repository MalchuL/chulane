/** Public data and callback contracts for action-menu. */

import type { ComponentType, ReactElement } from "react";
import type { MenuEntry } from "../types.js";
export type ActionMenuProps = {
  label: string;
  icon?: ComponentType;
  items: MenuEntry[];
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
} & (
  { presentation: "panel"; trigger?: never } | { presentation?: "popup"; trigger: ReactElement }
);
