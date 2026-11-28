/** Named icon actions with a keyboard- and pointer-triggered tooltip. */
import { Button } from "../button/button.js";
import { Tooltip } from "../tooltip/tooltip.js";
import type { IconButtonProps } from "./types.js";

/**
 * Render a compact icon action with an accessible name and tooltip.
 *
 * The host supplies the icon, name, action, and state. IconButton renders the
 * tooltip in the nearest theme scope so it uses the trigger’s theme.
 * @param props Button attributes, icon content, name and optional tooltip behavior.
 * @returns The button and its tooltip.
 * @example
 * <IconButton label="Favorite page" onClick={favorite}><Star /></IconButton>
 */
export function IconButton({
  label,
  size = "icon",
  variant = "ghost",
  tooltipSide,
  tooltipHoverable,
  ...rest
}: IconButtonProps) {
  return (
    <Tooltip
      trigger={<Button {...rest} size={size} variant={variant} aria-label={label} />}
      side={tooltipSide}
      hoverable={tooltipHoverable}
    >
      {label}
    </Tooltip>
  );
}
