/** Public contract for the floating selection command strip. */
import type { ComponentProps, ReactNode } from "react";
import type { Command } from "../../commands/types.js";

/** Formatting actions and optional controls shown next to the selection. */
export type SelectionToolbarProps = Omit<ComponentProps<"div">, "children"> & {
  /** Formatting commands in display order, with state and callbacks supplied by the host. */
  commands: readonly Command[];
  /** Whether to show the toolbar for the current selection. */
  visible: boolean;
  /** Optional controls before the formatting commands. Defaults to none. */
  leading?: ReactNode;
  /** Optional controls after the formatting commands. Defaults to none. */
  trailing?: ReactNode;
};
