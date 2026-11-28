/** Context actions for a keyboard-focusable block, page or navigation surface. */
import type { ReactElement, ReactNode } from "react";
import type { MenuEntry } from "../types.js";
export type ContextMenuProps = {
  label: string;
  items: MenuEntry[];
} & ({ asChild: true; children: ReactElement } | { asChild?: false; children: ReactNode });
