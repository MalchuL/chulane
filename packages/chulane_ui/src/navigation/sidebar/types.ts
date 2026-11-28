/** Host-owned destinations and user-controlled sidebar preferences. */
import type { ComponentProps, ComponentType, ReactNode } from "react";
import type { NavigationItem, NavigationTreeProps } from "../navigation-tree/types.js";

/** A primary route displayed above the sidebar's sections. */
export type SidebarDestination = {
  /** Stable ID used for selection. */
  id: string;
  /** Visible label and compact trigger name. */
  label: string;
  /** Destination icon. Defaults to a page icon. */
  icon?: ComponentType<{ className?: string }>;
};

/** A named group of navigation items. */
export type SidebarSection = {
  /** Stable ID used in preferences. */
  id: string;
  /** Compact trigger icon. Defaults to a folder icon. */
  icon?: ComponentType<{ className?: string }>;
  /** Heading and compact trigger name. */
  label: string;
  /** Destinations in host-provided order. */
  items: readonly NavigationItem[];
  /** Whether this section starts hidden. Defaults to false. */
  optional?: boolean;
};

/** How the sidebar arranges its destinations and sections. */
export type SidebarMode = "compact" | "standard" | "expanded";

/** Serializable presentation choices for the current sidebar. */
export type SidebarPreferences = {
  /** User-selected layout. */
  mode: SidebarMode;
  /** Section IDs in display order. New sections are appended. */
  order: string[];
  /** Section IDs excluded from the sidebar. */
  hidden: string[];
  /** Sections whose tree is closed in standard mode. */
  collapsed: string[];
};

/** Host-provided sidebar content, selection and controlled preferences. */
export type SidebarProps = Omit<ComponentProps<"nav">, "children"> &
  Pick<NavigationTreeProps, "selected" | "onSelectedChange" | "actions"> & {
    /** Header in standard and expanded modes. */
    header: ReactNode;
    /** Header in compact mode. Defaults to no content. */
    compactHeader?: ReactNode;
    /** Primary destinations. Defaults to an empty list. */
    destinations?: readonly SidebarDestination[];
    /** Footer content in standard and expanded modes. */
    footer: ReactNode;
    /** Available sections in default display order. */
    sections: readonly SidebarSection[];
    /** Current presentation preferences. */
    preferences: SidebarPreferences;
    /** Receives preferences after a settings action or section reorder. */
    onPreferencesChange: (next: SidebarPreferences) => void;
    /** Forces compact mode for narrow hosts. Defaults to false. */
    compact?: boolean;
  };
