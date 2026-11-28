/** popover presentation and interaction contract. */
import { usePortalHost } from "../theme-scope/hooks.js";
import { Popover as Primitive } from "radix-ui";
import { ScrollArea } from "../../components/ui/scroll-area.js";
import type { PopoverProps } from "./types.js";
import * as UI from "../../components/ui/popover.js";

export type { PopoverProps } from "./types.js";
/**
 * Keep a lightweight setting beside its trigger.
 * @param props Presentation values and host callbacks described by the public props type.
 * @returns The rendered Popover view.
 */
export function Popover({ label, trigger, children, open, onOpenChange }: PopoverProps) {
  const host = usePortalHost();
  const menuClassName = "cu-menu";
  return (
    <UI.Popover open={open} onOpenChange={onOpenChange}>
      <UI.PopoverTrigger asChild>{trigger}</UI.PopoverTrigger>

      <Primitive.Portal container={host}>
        <Primitive.Content
          data-slot="popover-content"
          aria-label={label}
          className={menuClassName}
          collisionPadding={0}
        >
          <ScrollArea className="cu-scroll-overlay">{children}</ScrollArea>
        </Primitive.Content>
      </Primitive.Portal>
    </UI.Popover>
  );
}
