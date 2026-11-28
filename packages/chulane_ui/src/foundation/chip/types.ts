/** Public attributes and removal contract for Chip. */
import type { ComponentProps, ComponentType } from "react";

/** Props for an item that the user can remove. */
export type ChipProps = Omit<ComponentProps<"button">, "children" | "onClick"> & {
  /** Visible item name and base for the remove action’s accessible name. */
  label: string;
  /** Decorative leading icon. Omitted by default. */
  icon?: ComponentType<{ className?: string }>;
  /** Invoked when the user activates removal. */
  onRemove: () => void;
};
