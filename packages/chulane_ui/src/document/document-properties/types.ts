/** Public contracts for the document metadata list. */
import type { ComponentProps, ReactNode } from "react";

/** Document metadata and attributes for its description list. */
export type DocumentPropertiesProps = Omit<ComponentProps<"dl">, "children"> & {
  /** Properties in display order. Labels must be unique within the list. */
  properties: readonly {
    /** Visible property name. */
    label: string;
    /** Content shown beside the name, such as text, a tag or a link. */
    value: ReactNode;
  }[];
};
