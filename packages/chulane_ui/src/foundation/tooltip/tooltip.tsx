/** Anchors text to a control and renders it in the nearest theme's portal. */
import { Tooltip as Primitive } from "radix-ui";
import { Tooltip as Root, TooltipTrigger } from "../../components/ui/tooltip.js";
import { usePortalHost } from "../theme-scope/hooks.js";
import { TooltipProvider } from "./tooltip-provider.js";
import type { TooltipProps } from "./types.js";

/**
 * Describe a focusable control on hover or keyboard focus. Radix owns timing and
 * dismissal, including closing on pointer exit unless the content is hoverable.
 * @param props The trigger, its description, and optional placement or pointer behavior.
 * @returns The trigger and its themed tooltip.
 */
export function Tooltip({ trigger, children, side = "top", hoverable = false }: TooltipProps) {
  const host = usePortalHost();
  const tooltipClassName = "cu-tooltip";
  const tooltipSpacingClassName = "cu-tooltip-spaced";
  return (
    <TooltipProvider>
      <Root disableHoverableContent={!hoverable}>
        <TooltipTrigger asChild>{trigger}</TooltipTrigger>
        <Primitive.Portal container={host}>
          <Primitive.Content className={tooltipSpacingClassName} side={side}>
            <div data-slot="tooltip-content" className={tooltipClassName}>
              {children}
            </div>
          </Primitive.Content>
        </Primitive.Portal>
      </Root>
    </TooltipProvider>
  );
}
