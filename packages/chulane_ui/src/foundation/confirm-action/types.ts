/** Defines the state and panel attributes for ConfirmAction. */
import type { ComponentProps, ReactElement } from "react";
import type { AlertDialog as Primitive } from "radix-ui";

/** Panel attributes, open state and content for ConfirmAction. */
export type ConfirmActionProps = Omit<
  ComponentProps<typeof Primitive.Content>,
  "asChild" | "children" | "title"
> & {
  /** Question or heading that names the confirmation. */
  title: string;
  /** Details that explain what confirming will do. */
  description: string;
  /** Text on the destructive confirmation button. */
  confirmLabel: string;
  /** Text on the safe action. Defaults to "Cancel". */
  cancelLabel?: string;
  /** Invoked when the user chooses the confirmation action. */
  onConfirm: () => void;
  /** Optional focusable trigger. Omit when the host opens the confirmation externally. */
  trigger?: ReactElement;
  /** Current visibility. Omit to let Radix own the open state. */
  open?: boolean;
  /** Initial uncontrolled visibility. Defaults to false. */
  defaultOpen?: boolean;
  /** Receives requests to open or close. Defaults to no callback. */
  onOpenChange?: (open: boolean) => void;
};
