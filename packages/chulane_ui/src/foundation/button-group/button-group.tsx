/** Layout and accessible grouping for related actions. */
import { cn } from "cn";
import { useContext } from "react";
import { ButtonGroup as Group } from "../../components/ui/button-group.js";
import { ButtonLayoutContext } from "../theme-scope/hooks.js";
import type { ButtonGroupProps } from "./types.js";

/**
 * Group related actions under one accessible name.
 *
 * The host supplies the actions and can override their layout. ButtonGroup
 * resolves the layout from the nearest theme scope when no override is provided.
 * @param props Group attributes, its name, and its action children.
 * @returns The accessible group of actions.
 * @example
 * <ButtonGroup label="Zoom"><Button>Zoom in</Button><Button>Zoom out</Button></ButtonGroup>
 */
export function ButtonGroup({ label, className, buttonLayout, ...rest }: ButtonGroupProps) {
  const inherited = useContext(ButtonLayoutContext);
  const layout = buttonLayout ?? inherited ?? "grouped";
  const groupClassName = "cu-group";
  return (
    <Group
      {...rest}
      orientation={layout === "separate" ? null : "horizontal"}
      data-layout={layout}
      role="group"
      aria-label={label}
      className={cn(groupClassName, className)}
    />
  );
}
