/** Public contracts for linked document paths. */
import type { ComponentProps } from "react";

/** One linked location in a document path. */
export type PageReference = {
  /** Stable location identifier. */
  id: string;
  /** Visible link label. */
  label: string;
  /** URL used for navigation. */
  href: string;
};

/** Breadcrumb path and attributes for its navigation element. */
export type BreadcrumbsProps = Omit<ComponentProps<"nav">, "children"> & {
  /** Ordered path from the outermost location to the current document. */
  items: readonly PageReference[];
};
