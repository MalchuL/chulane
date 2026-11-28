/** Host-owned destinations and user-controlled navigation preferences. */

import type { ReactNode, ComponentType } from "react";
import type { NavigationTreeProps } from "../navigation-tree/navigation-tree.js";
export type NavItem = {
  id: string;
  label: string;
  kind?: "project" | "page" | "collection" | "conversation";
  children?: NavItem[];
  href?: string;
};
export type NavSection = {
  id: string;
  icon?: ComponentType;
  label: string;
  items: NavItem[];
  optional?: boolean;
};
export type SidebarMode = "compact" | "standard" | "expanded";
export type SidebarPreferences = {
  mode: SidebarMode;
  order: string[];
  hidden: string[];
  collapsed: string[];
};
export type SidebarProps = Omit<NavigationTreeProps, "items"> & {
  header: ReactNode;
  compactHeader?: ReactNode;
  destinations?: {
    id: string;
    label: string;
    icon: ComponentType;
  }[];
  footer: ReactNode;
  sections: NavSection[];
  preferences: SidebarPreferences;
  onPreferences: (next: SidebarPreferences) => void;
  compact?: boolean;
};
