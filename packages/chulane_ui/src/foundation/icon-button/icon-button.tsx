/** icon button presentation and interaction contract. */
import { usePortalHost } from "../theme-scope/hooks.js";
import { Tooltip as Primitive } from "radix-ui";
import type { IconButtonProps } from "./types.js";
import * as UI from "../../components/ui/tooltip.js";
import { Button } from "../button/button.js";

export type { IconButtonProps } from "./types.js";

/**
 * Give a compact toolbar action a name, a tooltip and a visible focus indicator.
 * @param props Presentation values and host callbacks described by the public props type.
 * @returns The rendered IconButton view.
 */
export function IconButton({ label, children, ...props }: IconButtonProps) {
  const host = usePortalHost();
  const tooltipClassName = "cu-tooltip";
  return (
    <UI.TooltipProvider>
      <UI.Tooltip>
        <UI.TooltipTrigger asChild>
          <Button size="icon" variant="ghost" aria-label={label} {...props}>
            {children}
          </Button>
        </UI.TooltipTrigger>

        <Primitive.Portal container={host}>
          <Primitive.Content data-slot="tooltip-content" className={tooltipClassName}>
            {label}
          </Primitive.Content>
        </Primitive.Portal>
      </UI.Tooltip>
    </UI.TooltipProvider>
  );
}
