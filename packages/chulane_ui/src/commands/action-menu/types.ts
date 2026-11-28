/** Public contracts for an anchored popup or an inline menu panel. */
import type { ComponentProps, ComponentType, ReactElement } from "react";
import type { MenuEntry } from "../types.js";

/** Props for rendering a group of commands as an anchored popup or an inline panel. */
export type ActionMenuProps = {
  /** Accessible menu name, also displayed as the panel heading. */
  label: string;
  /** Commands and submenus in display order. */
  items: readonly MenuEntry[];
  /** Additional class names for the popup content or panel section. Defaults to none. */
  className?: string;
} & (
  | ({
      /** Renders the menu as an inline panel. */
      presentation: "panel";
      /** Leading heading icon. Defaults to no icon. */
      icon?: ComponentType<{ className?: string }>;
    } & Omit<ComponentProps<"section">, "children" | "className">)
  | ({
      /** Renders the menu as an anchored popup. Defaults to "popup". */
      presentation?: "popup";
      /** Focusable trigger that accepts Radix props and a ref. */
      trigger: ReactElement;
      /** Controlled popup visibility. Defaults to internal state. */
      open?: boolean;
      /** Initial popup visibility in uncontrolled mode. Defaults to false. */
      defaultOpen?: boolean;
      /** Receives visibility requests from the popup. Defaults to no callback. */
      onOpenChange?: (open: boolean) => void;
    } & Omit<ComponentProps<"div">, "children" | "className">)
);
