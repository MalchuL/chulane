/** Public inputs for the page browser and its host-owned actions. */
import type { ComponentProps } from "react";
import type { PageSummary } from "../page-row/index.js";
import type { MenuEntry } from "../../commands/types.js";

/** Props for browsing a set of pages. */
export type PageBrowserProps = Omit<ComponentProps<"section">, "children" | "title"> & {
  /** Heading shown above the results. */
  title: string;
  /** Pages available to search, sort and filter. */
  pages: readonly PageSummary[];
  /** Id of the selected page. Defaults to no selected page. */
  selected?: string;
  /** Called with the id of the page the user opens. */
  onOpen: (id: string) => void;
  /** Called when the user requests a new page. Defaults to no create button. */
  onCreate?: () => void;
  /** Provides menu entries for a page. Defaults to no page menus. */
  getActions?: (page: PageSummary) => readonly MenuEntry[];
  /** Host loading or error state. Defaults to displaying the results. */
  status?: "loading" | "error";
  /** Called when the user retries a failed load. Defaults to no retry button. */
  onRetry?: () => void;
};
