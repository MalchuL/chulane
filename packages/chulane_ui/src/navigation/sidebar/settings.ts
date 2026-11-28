/** Builds the sidebar settings shared by the context menu and footer trigger. */
import {
  ArrowDown,
  ArrowUp,
  Columns2,
  Eye,
  Folder,
  ListOrdered,
  PanelLeft,
  PanelLeftClose,
  RotateCcw,
} from "lucide-react";
import type { MenuEntry } from "../../commands/types.js";
import type { useSidebarSections } from "./hooks.js";
import { createDefaultSidebarPreferences } from "./preferences.js";
import type { SidebarProps } from "./types.js";

type SettingsProps = Pick<SidebarProps, "sections" | "preferences" | "onPreferencesChange"> &
  Pick<ReturnType<typeof useSidebarSections>, "ordered" | "toggleSection" | "moveSection">;

/**
 * Build mode, visibility, ordering and reset commands against the current preferences.
 * @param props Current sections, preferences and the operations they can trigger.
 * @returns Commands in settings menu order.
 */
export function createSidebarSettings(props: SettingsProps): MenuEntry[] {
  const { preferences, onPreferencesChange, ordered, toggleSection, moveSection, sections } = props;
  const modes = { compact: PanelLeftClose, standard: PanelLeft, expanded: Columns2 } as const;
  return [
    {
      id: "mode",
      label: "Navigation mode",
      icon: PanelLeft,
      items: (["compact", "standard", "expanded"] as const).map((mode) => ({
        id: mode,
        label: mode,
        icon: modes[mode],
        checked: preferences.mode === mode,
        onSelect: () => onPreferencesChange({ ...preferences, mode }),
      })),
    },
    {
      id: "visible",
      label: "Visible sections",
      icon: Eye,
      items: ordered.map((section) => ({
        id: section.id,
        label: section.label,
        icon: section.icon ?? Folder,
        checked: !preferences.hidden.includes(section.id),
        onSelect: () => toggleSection("hidden", section.id),
      })),
    },
    {
      id: "order",
      label: "Reorder sections",
      icon: ListOrdered,
      items: ordered.flatMap((section, index) => [
        reorderCommand(section.id, section.label, ordered[index - 1]?.id, "up", moveSection),
        reorderCommand(section.id, section.label, ordered[index + 1]?.id, "down", moveSection),
      ]),
    },
    {
      id: "reset",
      label: "Restore defaults",
      icon: RotateCcw,
      onSelect: () => onPreferencesChange(createDefaultSidebarPreferences(sections)),
    },
  ];
}

/**
 * Describe a move to an adjacent section, disabling entries at the edge of the list.
 * @param id Moved section ID.
 * @param label Moved section label.
 * @param target Adjacent section ID, when available.
 * @param direction Direction shown in the menu.
 * @param moveSection Updates the section order.
 * @returns The move command.
 */
function reorderCommand(
  id: string,
  label: string,
  target: string | undefined,
  direction: "up" | "down",
  moveSection: SettingsProps["moveSection"],
): MenuEntry {
  return {
    id: id + "-" + direction,
    icon: direction === "up" ? ArrowUp : ArrowDown,
    label: "Move " + label + " " + direction,
    disabled: target === undefined,
    onSelect: () => {
      if (target !== undefined) {
        moveSection(id, target);
      }
    },
  };
}
