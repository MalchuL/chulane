/** Public data and callback contracts for block-controls. */

import type { MenuEntry } from "../../commands/types.js";
import type { ReactNode, DragEventHandler } from "react";
export type BlockControlsProps = {
  children: ReactNode;
  actions: MenuEntry[];
  onInsert: () => void;
  onDragStart?: DragEventHandler<HTMLButtonElement>;
};
