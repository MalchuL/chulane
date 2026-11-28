/** Host-owned actions shared by every command surface. */
import type { ComponentType } from "react";
export type Command = {
  id: string;
  label: string;
  group?: string;
  shortcut?: string;
  icon?: ComponentType;
  description?: string;
  destructive?: boolean;
  disabled?: boolean;
  checked?: boolean;
  run: () => void;
};
export type MenuEntry =
  Command | { id: string; label: string; icon?: ComponentType; items: MenuEntry[] };
