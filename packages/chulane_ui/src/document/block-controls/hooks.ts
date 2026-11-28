/** Tracks dropdown visibility and which block action button anchors the dropdown. */
import { useState } from "react";
import type { BlockControlsProps } from "./types.js";

type Trigger = "grip" | "more";

/**
 * Coordinate the two dropdown buttons around one optional host-controlled open value.
 * @param open Host-supplied visibility, or undefined for local state.
 * @param onOpenChange Optional listener for dropdown visibility changes.
 * @returns The active trigger, current visibility and callbacks for both buttons.
 * @example
 * const { anchor, menuOpen, changeOpen } = useBlockMenu(open, onOpenChange);
 */
export function useBlockMenu(
  open: BlockControlsProps["open"],
  onOpenChange: BlockControlsProps["onOpenChange"],
) {
  const [anchor, setAnchor] = useState<Trigger>("grip");
  const [localOpen, setLocalOpen] = useState(false);
  const menuOpen = open ?? localOpen;

  /**
   * Remember where the dropdown was requested and publish its visibility.
   * @param trigger The button that requested the change.
   * @param nextOpen Whether to show the dropdown.
   */
  function changeOpen(trigger: Trigger, nextOpen: boolean) {
    if (nextOpen) {
      setAnchor(trigger);
    }
    if (open === undefined) {
      setLocalOpen(nextOpen);
    }
    onOpenChange?.(nextOpen);
  }

  return { anchor, menuOpen, changeOpen };
}
