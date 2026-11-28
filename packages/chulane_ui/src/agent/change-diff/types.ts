/** Host-owned text and disclosure options for comparing two revisions. */
import type { ComponentProps } from "react";

/** Revision text, trigger options and attributes for the root div. */
export type ChangeDiffProps = Omit<
  ComponentProps<"div">,
  "children" | "dangerouslySetInnerHTML"
> & {
  /** Original text, shown as removed. */
  before: string;
  /** Replacement text, shown as added. */
  after: string;
  /** Accessible trigger name and visible text in the standard layout. Defaults to "View diff". */
  label?: string;
  /** Uses a chevron-only trigger with a native tooltip. Defaults to false. */
  compact?: boolean;
};
