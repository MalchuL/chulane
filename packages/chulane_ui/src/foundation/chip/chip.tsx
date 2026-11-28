/** chip presentation and interaction contract. */
import { Button } from "../button/button.js";
import type { ChipProps } from "./types.js";
import { X } from "lucide-react";

export type { ChipProps } from "./types.js";
/**
 * Let the user inspect and remove a context attachment.
 * @param props Presentation values and host callbacks described by the public props type.
 * @returns The rendered Chip view.
 */
export function Chip({ label, onRemove, icon: Icon }: ChipProps) {
  return (
    <Button
      variant="outline"
      size="xs"

      type="button"
      aria-label={"Remove " + label}
      onClick={onRemove}
    >
      {Icon && <Icon />}
      {label}
      <X aria-hidden />
    </Button>
  );
}
