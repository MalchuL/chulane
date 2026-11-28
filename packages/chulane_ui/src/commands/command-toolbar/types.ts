/** Public contract for a toolbar backed by host-owned commands. */
import type { ComponentProps } from "react";
import type { ButtonLayout } from "../../foundation/button-group/types.js";
import type { Command } from "../types.js";

/** Button-group attributes, accessibility label and commands. */
export type CommandToolbarProps = Omit<ComponentProps<"div">, "children" | "className"> & {
  /** Grouped or separate buttons. Defaults to the enclosing theme's layout, then "grouped". */
  buttonLayout?: ButtonLayout;
  /** Accessible name for the button group. */
  label: string;
  /** Commands as buttons, in display order. */
  commands: readonly Command[];
  /** Additional class names for the button group. Defaults to none. */
  className?: string;
};
