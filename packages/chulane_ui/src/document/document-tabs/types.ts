/** Public contracts for switching, reordering and closing open documents. */
import type { ComponentType } from "react";
import type { ScrollAreaProps } from "../../foundation/scroll-area/types.js";

/** One host-owned open document in the tab strip. */
export type DocumentTab = {
  /** Stable id used for selection, reordering and close requests. */
  id: string;
  /** Visible document title. */
  title: string;
  /** Decorative title icon. Omitted by default. */
  icon?: ComponentType<{ className?: string }>;
  /** Tooltip and accessible description. Omitted by default. */
  description?: string;
};

/** Controlled tab strip props and attributes for its scroll container. */
export type DocumentTabsProps = Omit<ScrollAreaProps, "children" | "onClose" | "orientation"> & {
  /** Accessible name of the navigation. Defaults to "Open documents". */
  label?: string;
  /** Open documents in display order. */
  tabs: readonly DocumentTab[];
  /** Id of the active document. */
  value: string;
  /** Called with the id the user activates. */
  onValueChange: (id: string) => void;
  /** Called with the id the user requests to close. */
  onClose: (id: string) => void;
  /** Called with the moved id and the id at its desired position. */
  onMove: (id: string, targetId: string) => void;
};
