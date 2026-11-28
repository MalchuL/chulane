/** Public data and callback contracts for change-review. */
import type { ButtonLayout } from "../../foundation/button-group/types.js";

import type { PageReference } from "../../document/breadcrumbs/breadcrumbs.js";
export type ChangeStatus =
  "pending" | "applying" | "applied" | "dismissed" | "failed" | "cancelled";
export type ProposedChange = {
  id: string;
  summary: string;
  target: Pick<PageReference, "id" | "label"> & Partial<Pick<PageReference, "href">>;
  status: ChangeStatus;
  before: string;
  after: string;
  error?: string;
};
export type ChangeReviewProps = {
  buttonLayout?: ButtonLayout;
  changes: ProposedChange[];
  onApply: (id: string) => void;
  onDismiss: (id: string) => void;
  onUndo?: (id: string) => void;
};
