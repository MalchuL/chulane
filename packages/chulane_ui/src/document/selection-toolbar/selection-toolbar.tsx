/** selection toolbar presentation and interaction contract. */
import type { SelectionToolbarProps } from "./types.js";
import { useSelectionPosition } from "./hooks.js";
import { CommandToolbar } from "../../commands/command-toolbar/command-toolbar.js";

export type { SelectionToolbarProps } from "./types.js";
/**
 * Offer formatting operations when the host reports a text selection.
 * @param props Presentation values and host callbacks described by the public props type.
 * @returns The rendered SelectionToolbar view.
 */
export function SelectionToolbar({ commands, visible, leading, trailing }: SelectionToolbarProps) {
  const selectionToolbarClassName = "cu-selection-toolbar";
  const { ref, position } = useSelectionPosition(visible);
  return visible ? (
    <div
      ref={ref}
      style={position}
      className={selectionToolbarClassName}
      onMouseDown={(e) => e.preventDefault()}
    >
      {leading}
      <CommandToolbar label="Format selection" commands={commands} />
      {trailing}
    </div>
  ) : null;
}
