/** Public contract for the document article and its host-supplied content. */
import type { ComponentProps, ReactNode } from "react";

/** An article with a visible document heading and an optional metadata slot. */
export type DocumentSurfaceProps = Omit<ComponentProps<"article">, "children"> & {
  /** Content of the document's primary heading. */
  heading: ReactNode;
  /** Metadata rendered between heading and body. Defaults to no metadata. */
  properties?: ReactNode;
  /** Document body supplied by the host. */
  children: ReactNode;
  /** Whether to remove the reading-width limit. Defaults to false. */
  fullWidth?: boolean;
};
