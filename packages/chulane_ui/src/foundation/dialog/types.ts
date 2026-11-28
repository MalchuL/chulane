/** Defines the state and panel attributes for Dialog. */
import type { ComponentProps, ReactElement, ReactNode, RefObject } from "react";
import type { Dialog as Primitive } from "radix-ui";

/** Panel attributes, open state and content for Dialog. */
export type DialogProps = Omit<
  ComponentProps<typeof Primitive.Content>,
  "asChild" | "children" | "title"
> & {
  /** Visible heading and accessible name of the modal. */
  title: string;
  /** Optional text below the title. Defaults to no description. */
  description?: string;
  /** Element to focus on open. Defaults to the heading. */
  initialFocus?: RefObject<HTMLElement | null>;
  /** Optional focusable trigger. Omit when the host opens the dialog externally. */
  trigger?: ReactElement;
  /** Content displayed in the scrollable body. */
  children: ReactNode;
  /** Current visibility. Omit to let Radix own the open state. */
  open?: boolean;
  /** Initial uncontrolled visibility. Defaults to false. */
  defaultOpen?: boolean;
  /** Receives requests to open or close. Defaults to no callback. */
  onOpenChange?: (open: boolean) => void;
};
