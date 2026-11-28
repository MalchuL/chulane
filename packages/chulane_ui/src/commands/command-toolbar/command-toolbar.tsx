/** Renders frequently used commands as a theme-aware group of buttons. */
import { cn } from "cn";
import { ButtonGroup } from "../../foundation/button-group/index.js";
import { Button } from "../../foundation/button/button.js";
import { IconButton } from "../../foundation/icon-button/icon-button.js";
import type { Command } from "../types.js";
import type { CommandToolbarProps } from "./types.js";

/**
 * Place frequently used commands in a compact row of buttons.
 *
 * The host owns command behavior and pressed state. The toolbar chooses an icon
 * button when an icon is supplied and a text button otherwise.
 * @param props Commands, accessible label, layout and group attributes.
 * @returns A labeled button group in host order.
 * @example
 * <CommandToolbar
 *   label="Page actions"
 *   commands={[{ id: "favorite", label: "Favorite", icon: Star, checked: favorite, onSelect: toggleFavorite }]}
 * />
 */
export function CommandToolbar({
  label,
  commands,
  buttonLayout,
  className,
  ...rest
}: CommandToolbarProps) {
  const groupClassName = "flex-wrap max-w-full";
  return (
    <ButtonGroup
      label={label}
      buttonLayout={buttonLayout}
      className={cn(groupClassName, className)}
      {...rest}
    >
      {commands.map((command) => (
        <ToolbarButton key={command.id} command={command} />
      ))}
    </ButtonGroup>
  );
}

/**
 * Render a button that exposes the command's name, disabled state and pressed state.
 * @param props The host-owned command.
 * @returns An icon or text button bound to the command.
 */
function ToolbarButton({ command }: { command: Command }) {
  const buttonClassName = "min-w-0 whitespace-normal wrap-anywhere";
  const { icon: Icon, label, disabled, checked, onSelect } = command;
  const props = { type: "button" as const, disabled, "aria-pressed": checked, onClick: onSelect };
  if (Icon) {
    return (
      <IconButton {...props} label={label}>
        <Icon aria-hidden />
      </IconButton>
    );
  }

  return (
    <Button {...props} variant="ghost" className={buttonClassName}>
      {label}
    </Button>
  );
}
