/** Renders host formatting commands without moving focus away from selected text on mouse down. */
import { cn } from "cn";
import { CommandToolbar } from "../../commands/command-toolbar/command-toolbar.js";
import { useSelectionPosition } from "./hooks.js";
import type { SelectionToolbarProps } from "./types.js";

/**
 * Render and position the mounted toolbar next to its containing block's selection.
 * @param props The toolbar slots and root attributes.
 * @returns The positioned toolbar.
 */
function VisibleSelectionToolbar({
  commands,
  leading,
  trailing,
  className,
  onMouseDown,
  style,
  ref: forwardedRef,
  ...rest
}: Omit<SelectionToolbarProps, "visible">) {
  const selectionToolbarClassName = "cu-selection-toolbar";
  const { ref, position } = useSelectionPosition(forwardedRef);
  return (
    <div
      {...rest}
      ref={ref}
      style={{ ...position, ...style }}
      className={cn(selectionToolbarClassName, className)}
      onMouseDown={(event) => {
        onMouseDown?.(event);
        event.preventDefault();
      }}
    >
      {leading}
      <CommandToolbar label="Format selection" commands={commands} />
      {trailing}
    </div>
  );
}

/**
 * Float a strip of formatting commands above the current text selection.
 *
 * The host owns visibility, commands and editor mutations. The toolbar measures text within
 * its parent element and preserves editor focus when a control is pressed with the mouse.
 * @param props The selection visibility, commands, slots and root attributes.
 * @returns The floating toolbar while visible.
 * @example
 * <SelectionToolbar visible={hasSelection}
 *   commands={[{ id: "bold", label: "Bold", onSelect: toggleBold }]} />
 */
export function SelectionToolbar({ visible, ...props }: SelectionToolbarProps) {
  return visible ? <VisibleSelectionToolbar {...props} /> : null;
}
