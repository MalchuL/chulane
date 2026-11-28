/** Compact remove action for a selected item or attachment. */
import { cn } from "cn";
import { X } from "lucide-react";
import { Button } from "../button/button.js";
import type { ChipProps } from "./types.js";

/**
 * Show a removable item with its label and optional icon.
 *
 * The host owns the item and removes it in response to the button activation.
 * Chip gives that action an accessible name and shows the remove affordance.
 * @param props The item presentation, native button attributes, and removal callback.
 * @returns A labeled remove button.
 * @example
 * <Chip label="Field notes" onRemove={removeNotes} />
 */
export function Chip({ label, onRemove, icon: Icon, className, ...rest }: ChipProps) {
  const chipClassName = "cu-chip";
  const labelClassName = "cu-chip-label";
  const removeIconClassName = "cu-icon-sm";
  return (
    <Button
      {...rest}
      variant="outline"
      size="sm"
      aria-label={"Remove " + label}
      className={cn(chipClassName, className)}
      onClick={onRemove}
    >
      {Icon && <Icon />}
      <span className={labelClassName}>{label}</span>
      <X aria-hidden className={removeIconClassName} />
    </Button>
  );
}
