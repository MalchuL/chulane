/** Public layout and DOM contracts for grouped actions. */
import type { ComponentProps, ReactNode } from "react";

/** Whether adjacent actions share an edge or have a gap. */
export type ButtonLayout = "grouped" | "separate";

/** Props for a group of related actions. */
export type ButtonGroupProps = ComponentProps<"div"> & {
  /** Layout override. Defaults to the nearest theme scope or "grouped". */
  buttonLayout?: ButtonLayout;
  /** Accessible name of the group. */
  label: string;
  /** Actions and any supporting content. */
  children: ReactNode;
};
