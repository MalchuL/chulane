/** Public attributes for the metadata label. */
import type { ComponentProps, ReactNode } from "react";

/** Props for a metadata label. */
export type BadgeProps = ComponentProps<"span"> & {
  /** Metadata or status content. */
  children: ReactNode;
};
