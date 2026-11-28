/** Public orientation and accessibility settings for Separator. */
import type { ComponentProps } from "react";
import type { Separator } from "../../components/ui/separator.js";

/** Props for a horizontal or vertical divider. */
export type SeparatorProps = ComponentProps<typeof Separator> & {
  /** Axis of the divider. Defaults to "horizontal". */
  orientation?: "horizontal" | "vertical";
  /** Hide the divider from assistive technology. Defaults to true. */
  decorative?: boolean;
};
