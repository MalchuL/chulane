/** Public page metadata and host callbacks for list rows and grid cards. */
import type { ComponentProps, ComponentType } from "react";
import type { MenuEntry } from "../../commands/types.js";

/** Host-owned metadata needed to browse and open a page. */
export type PageSummary = {
  /** Stable page identifier. */
  id: string;
  /** Title displayed in the row or card. */
  title: string;
  /** Searchable summary text. Omitted by default. */
  description?: string;
  /** Decorative thumbnail. Defaults to a document icon. */
  thumbnail?: {
    /** Cover URL, which takes precedence over the icon and emoji. Omitted by default. */
    src?: string;
    /** Icon shown when there is no cover. Defaults to the document icon if there is no emoji. */
    icon?: ComponentType<{ className?: string }>;
    /** Decorative emoji shown when there is no cover or icon. Omitted by default. */
    emoji?: string;
  };
  /** Date string displayed as supplied and compared lexically for recent-first sorting. */
  date: string;
  /** Name of the owning collection. */
  collection: string;
  /** Tags assigned to the page. Omitted by default. */
  tags?: readonly string[];
  /** Whether the page is a favorite. Defaults to false. */
  favorite?: boolean;
};

/** Props for an individual page row and its optional menu. */
export type PageRowProps = Omit<ComponentProps<"div">, "children"> & {
  /** Page to display. */
  page: PageSummary;
  /** Whether the page is currently selected. Defaults to false. */
  selected?: boolean;
  /** Called with the page id when the user opens the page. */
  onOpen: (id: string) => void;
  /** Entries shared by both page menus. Defaults to no menus. */
  actions?: readonly MenuEntry[];
};
