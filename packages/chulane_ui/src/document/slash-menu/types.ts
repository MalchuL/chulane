/** Public data and callbacks for choosing a block type from the slash menu. */
import type { ComponentProps, ComponentType } from "react";

/** One available block type. */
export type SlashMenuOption = {
  /** Stable identifier returned on selection. */
  id: string;
  /** Visible, searchable name of the block type. */
  label: string;
  /** Optional searchable group heading. Defaults to an unlabelled group. */
  group?: string;
  /** Icon shown before the name. Defaults to no icon. */
  icon?: ComponentType<{ className?: string }>;
  /** Optional shortcut shown after the name. Defaults to no shortcut. */
  shortcut?: string;
  /** Whether to hide this unavailable option. Defaults to false. */
  disabled?: boolean;
};

/** Host-controlled search and selection in an inline block picker. */
export type SlashMenuProps = Omit<ComponentProps<"section">, "children" | "onSelect"> & {
  /** Block types available for insertion. */
  options: readonly SlashMenuOption[];
  /** Current search text, including the empty string for an unfiltered list. */
  query: string;
  /** Called with the next search text after the user edits the input. */
  onQueryChange: (query: string) => void;
  /** Called with the chosen option's identifier. */
  onSelect: (id: string) => void;
  /** Called when Escape requests dismissal. */
  onClose: () => void;
};
