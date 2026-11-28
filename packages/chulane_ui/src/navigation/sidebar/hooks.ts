/** Resolves section presentation and reports preference changes to the sidebar host. */
import { useState } from "react";
import type { SidebarProps } from "./types.js";

type SectionOptions = Pick<SidebarProps, "sections" | "preferences" | "onPreferencesChange">;

/**
 * Resolve ordered and visible sections, with local state for the active column and popover.
 * @param options Available sections, current preferences and the host's change callback.
 * @returns Section presentation state and operations used by sidebar controls.
 */
export function useSidebarSections({ sections, preferences, onPreferencesChange }: SectionOptions) {
  const [compactSection, setCompactSection] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<string>();
  const ids = new Set([...preferences.order, ...sections.map((section) => section.id)]);
  const ordered = [...ids].flatMap((id) => sections.filter((section) => section.id === id));
  const visible = ordered.filter((section) => !preferences.hidden.includes(section.id));
  const current = visible.find((section) => section.id === activeSection) ?? visible[0];

  /**
   * Toggle a section in a preference list.
   * @param key List to update.
   * @param id Section ID.
   */
  function toggleSection(key: "hidden" | "collapsed", id: string) {
    const entries = preferences[key];
    onPreferencesChange({
      ...preferences,
      [key]: entries.includes(id) ? entries.filter((entry) => entry !== id) : [...entries, id],
    });
  }

  /**
   * Move one section to the target section's original position.
   * @param id Moved section ID.
   * @param target Target section ID. Missing IDs leave the order unchanged.
   */
  function moveSection(id: string, target: string) {
    const order = ordered.map((section) => section.id);
    const position = order.indexOf(target);
    if (position < 0 || !order.includes(id) || id === target) {
      return;
    }
    const next = order.filter((entry) => entry !== id);
    next.splice(position, 0, id);
    onPreferencesChange({ ...preferences, order: next });
  }

  return {
    ordered,
    visible,
    current,
    compactSection,
    setCompactSection,
    setActiveSection,
    toggleSection,
    moveSection,
  };
}
