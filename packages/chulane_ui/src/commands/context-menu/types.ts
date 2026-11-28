/** Public contract for a context menu attached to a focusable target. */
import type { ComponentProps, ReactElement, ReactNode } from "react";
import type { MenuEntry } from "../types.js";

/** Trigger attributes, menu entries and the host's target element or content. */
export type ContextMenuProps = Omit<ComponentProps<"div">, "children" | "className"> & {
  /** Accessible menu name and default trigger name. */
  label: string;
  /** Commands and submenus in display order. */
  items: readonly MenuEntry[];
  /** Additional class names for the trigger element. Defaults to none. */
  className?: string;
} & (
    | {
        /** Attaches the trigger to the supplied element. */
        asChild: true;
        /** Focusable element that accepts Radix props and a ref. */
        children: ReactElement;
      }
    | {
        /** Uses a focusable wrapper for the supplied content. Defaults to false. */
        asChild?: false;
        /** Content inside the focusable trigger. */
        children: ReactNode;
      }
  );
