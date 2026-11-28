/** Public data and callback contracts for page-row. */

import type { MenuEntry } from "../../commands/types.js";
export type PageSummary = {
  id: string;
  title: string;
  preview?: string;
  date: string;
  collection: string;
  tags?: string[];
  favorite?: boolean;
};
export type PageRowProps = {
  page: PageSummary;
  selected?: boolean;
  onOpen: () => void;
  actions?: MenuEntry[];
};
