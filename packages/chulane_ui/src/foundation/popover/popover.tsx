/** Renders an anchored overlay inside the nearest theme scope. */
import { cn } from "cn";
import { Popover as Primitive } from "radix-ui";
import * as UI from "../../components/ui/popover.js";
import { ScrollArea } from "../../components/ui/scroll-area.js";
import { usePortalHost } from "../theme-scope/hooks.js";
import type { PopoverProps } from "./types.js";

/**
 * Show related content beside its trigger.
 *
 * The host supplies the trigger and content and can control visibility. Radix
 * positions the panel and handles dismissal and focus restoration.
 *
 * @param props Trigger, panel content, open state and panel attributes.
 * @returns The trigger and portaled popover.
 * @example
 * <Popover label="Page details" trigger={<button>Details</button>}>
 *   Created today.
 * </Popover>
 */
export function Popover({
  label,
  trigger,
  children,
  open,
  defaultOpen,
  onOpenChange,
  className,
  collisionPadding = 0,
  ...rest
}: PopoverProps) {
  const host = usePortalHost();
  const panelClassName = "cu-menu";
  const scrollClassName = "cu-scroll-overlay";
  return (
    <UI.Popover open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
      <UI.PopoverTrigger asChild>{trigger}</UI.PopoverTrigger>
      <Primitive.Portal container={host}>
        <Primitive.Content
          data-slot="popover-content"
          {...rest}
          aria-label={label}
          className={cn(panelClassName, className)}
          collisionPadding={collisionPadding}
        >
          <ScrollArea className={scrollClassName}>{children}</ScrollArea>
        </Primitive.Content>
      </Primitive.Portal>
    </UI.Popover>
  );
}
