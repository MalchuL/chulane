/** Defines the state and panel attributes for Popover. */
import type { ComponentProps, ReactElement, ReactNode } from "react";
import type { Popover as Primitive } from "radix-ui";

/** Panel attributes, open state and content for Popover. */
export type PopoverProps = Omit<
  ComponentProps<typeof Primitive.Content>,
  "asChild" | "children"
> & {
  /** Accessible name of the popover panel. */
  label: string;
  /** Focusable element that anchors and opens the popover. */
  trigger: ReactElement;
  /** Content displayed in the scrollable panel. */
  children: ReactNode;
  /** Current visibility. Omit to let Radix own the open state. */
  open?: boolean;
  /** Initial uncontrolled visibility. Defaults to false. */
  defaultOpen?: boolean;
  /** Receives requests to open or close. Defaults to no callback. */
  onOpenChange?: (open: boolean) => void;
};
