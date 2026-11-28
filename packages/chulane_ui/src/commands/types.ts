/** Host-owned commands and nested groups shared by the command surfaces. */
import type { ComponentType } from "react";

/** An action supplied by the host and invoked when a user selects it. */
export type Command = {
  /** Stable identifier, unique within the command surface. */
  id: string;
  /** Human-readable name used for display and search. */
  label: string;
  /** Search group heading. Defaults to the unnamed group. */
  group?: string;
  /** Display-only keyboard hint. Defaults to no hint. */
  shortcut?: string;
  /** Leading icon component. Defaults to no icon. */
  icon?: ComponentType<{ className?: string }>;
  /** Supporting text shown in menus. Defaults to no description. */
  description?: string;
  /** Uses the destructive menu treatment. Defaults to false. */
  destructive?: boolean;
  /** Prevents activation and excludes the action from search results. Defaults to false. */
  disabled?: boolean;
  /** Host-owned toggle state. Defaults to undefined for a regular action. */
  checked?: boolean;
  /** Invoked once when the user selects the action. */
  onSelect: () => void;
};

/** A selectable command or a submenu with recursively nested entries. */
export type MenuEntry =
  | Command
  | {
      /** Stable identifier, unique among sibling entries. */
      id: string;
      /** Visible name of the submenu. */
      label: string;
      /** Leading icon component. Defaults to no icon. */
      icon?: ComponentType<{ className?: string }>;
      /** Supporting text shown under the submenu name. Defaults to no description. */
      description?: string;
      /** Entries shown when the submenu opens. */
      items: readonly MenuEntry[];
    };
