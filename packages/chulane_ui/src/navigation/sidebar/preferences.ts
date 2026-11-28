/** Derives initial sidebar preferences from host-provided sections. */
import type { NavSection, SidebarPreferences } from "./types.js";
export function defaultSidebar(sections: NavSection[]): SidebarPreferences {
  return {
    mode: "standard",
    order: sections.map((s) => s.id),
    hidden: sections.filter((s) => s.optional).map((s) => s.id),
    collapsed: [],
  };
}
