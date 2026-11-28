/** Manages palette visibility when the host leaves it uncontrolled. */
import { useState } from "react";
import type { CommandPaletteProps } from "./types.js";

/**
 * Resolve controlled or internal visibility and notify the host of user requests.
 * @param props Controlled value, initial uncontrolled value and change callback.
 * @returns The current open state and the function for requesting a change.
 */
export function usePaletteOpen({
  open,
  defaultOpen = false,
  onOpenChange,
}: Pick<CommandPaletteProps, "open" | "defaultOpen" | "onOpenChange">) {
  const [localOpen, setLocalOpen] = useState(defaultOpen);

  /**
   * Update local visibility when uncontrolled and notify the host in either mode.
   * @param nextOpen Requested visibility.
   * @returns Nothing.
   */
  function changeOpen(nextOpen: boolean) {
    if (open === undefined) {
      setLocalOpen(nextOpen);
    }
    onOpenChange?.(nextOpen);
  }

  return [open ?? localOpen, changeOpen] as const;
}
