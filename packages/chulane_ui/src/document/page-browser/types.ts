/** Public data and callback contracts for page-browser. */

import type { PageSummary } from "../page-row/page-row.js";
import type { MenuEntry } from "../../commands/types.js";
export type PageBrowserProps = {
  title: string;
  pages: PageSummary[];
  selected?: string;
  onOpen: (id: string) => void;
  onCreate?: () => void;
  actions?: (p: PageSummary) => MenuEntry[];
  status?: "loading" | "error";
  onRetry?: () => void;
};
