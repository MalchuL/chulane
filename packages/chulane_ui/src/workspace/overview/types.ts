/** Public data and callback contracts for overview. */

import type { PageReference } from "../../document/breadcrumbs/breadcrumbs.js";
export type WorkspaceOverviewProps = {
  title: string;
  sections: { label: string; items: PageReference[] }[];
};
