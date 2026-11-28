/** Public contract for a searchable command dialog. */
import type { ComponentProps, ReactElement } from "react";
import type { Command } from "../types.js";

/** Dialog content props and the host-owned commands and visibility options. */
export type CommandPaletteProps = Omit<ComponentProps<"div">, "children" | "className"> & {
  /** Commands available to search. Disabled commands are excluded. */
  commands: readonly Command[];
  /** Focusable trigger that accepts Radix props and a ref. Defaults to no trigger. */
  trigger?: ReactElement;
  /** Controlled dialog visibility. Defaults to internal state. */
  open?: boolean;
  /** Initial dialog visibility in uncontrolled mode. Defaults to false. */
  defaultOpen?: boolean;
  /** Receives visibility requests, including selection and dismissal. Defaults to no callback. */
  onOpenChange?: (open: boolean) => void;
  /** Additional class names for the dialog content. Defaults to none. */
  className?: string;
};
