/** Public single-selection contract for SegmentedControl. */
import type { ComponentProps } from "react";

/** Props for a single-choice group with host-owned selection. */
export type SegmentedControlProps = Omit<
  ComponentProps<"div">,
  "children" | "defaultValue" | "dir"
> & {
  /** Keyboard navigation direction. Defaults to the surrounding Radix direction. */
  dir?: "ltr" | "rtl";
  /** Accessible name of the group. */
  label: string;
  /** Unique, nonempty strings used as both option labels and values. */
  options: readonly string[];
  /** Currently selected option. */
  value: string;
  /** Called with the newly selected option. */
  onValueChange: (value: string) => void;
};
