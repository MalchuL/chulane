/** Public contract for an editable block and its host-owned actions. */
import type { ComponentProps, DragEventHandler, ReactNode } from "react";
import type { MenuEntry } from "../../commands/types.js";

/** Block content, gutter actions and dropdown state. */
export type BlockControlsProps = Omit<ComponentProps<"div">, "children"> & {
  /** Editable block content supplied by the host. */
  children: ReactNode;
  /** Commands shared by both action buttons and the block context menu. */
  actions: readonly MenuEntry[];
  /** Called when the user requests insertion next to the block. */
  onInsert: () => void;
  /** Starts a drag from the grip. The grip is non-draggable by default. */
  onHandleDragStart?: DragEventHandler<HTMLButtonElement>;
  /** Controls the action dropdown's visibility. By default the component manages it. */
  open?: boolean;
  /** Reports requested dropdown visibility changes from either action button. */
  onOpenChange?: (open: boolean) => void;
};
