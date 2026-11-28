/** Creates standard sidebar preferences from the host's section definitions. */
import type { SidebarPreferences, SidebarSection } from "./types.js";

/**
 * Use host order and show all non-optional sections with their groups open.
 * @param sections Sidebar sections in default order.
 * @returns Fresh preferences suitable for initializing or resetting the sidebar.
 */
export function createDefaultSidebarPreferences(
  sections: readonly SidebarSection[],
): SidebarPreferences {
  return {
    mode: "standard",
    order: sections.map((section) => section.id),
    hidden: sections.filter((section) => section.optional).map((section) => section.id),
    collapsed: [],
  };
}
