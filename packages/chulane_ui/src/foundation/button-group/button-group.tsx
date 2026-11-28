/** button group presentation and interaction contract. */
import { useContext } from "react";
import { ButtonLayoutContext } from "../theme-scope/hooks.js";

import { ButtonGroup as Group } from "../../components/ui/button-group.js";

import type { ButtonGroupProps } from "./types.js";
export type { ButtonLayout, ButtonGroupProps } from "./types.js";

/**
 * Group related actions under one accessible name.
 * @param props Presentation values and host callbacks described by the public props type.
 * @returns The rendered ButtonGroup view.
 */
export function ButtonGroup({ label, children, buttonLayout }: ButtonGroupProps) {
  const inherited = useContext(ButtonLayoutContext);
  const layout = buttonLayout ?? inherited ?? "grouped";
  const groupClassName = "cu-group";
  return (
    <Group
      orientation={layout === "separate" ? null : "horizontal"}
      data-layout={layout}
      role="group"
      aria-label={label}
      className={groupClassName}
    >
      {children}
    </Group>
  );
}
