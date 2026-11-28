/** Public scroll region attributes and scrollbar configuration. */
import type { ComponentProps } from "react";
import type { ScrollArea } from "radix-ui";

/** Props for the scroll area root. */
export type ScrollAreaProps = ComponentProps<typeof ScrollArea.Root> & {
  /** Enabled scrollbar axes. Defaults to "vertical". */
  orientation?: "horizontal" | "vertical" | "both";
};
