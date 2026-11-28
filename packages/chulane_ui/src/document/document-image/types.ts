/** Public contracts for an image and its source attribution. */
import type { ComponentProps } from "react";

/** Document image inputs and attributes for its figure. */
export type DocumentImageProps = Omit<ComponentProps<"figure">, "children"> & {
  /** URL of the image. */
  src: string;
  /** Accessible description or an empty string for a decorative image. */
  alt: string;
  /** Text displayed below the image. Omitted by default. */
  caption?: string;
  /** Linked credit displayed after the caption. Omitted by default. */
  attribution?: {
    /** Visible credit text. */
    label: string;
    /** URL of the source or its credit page. */
    href: string;
  };
};
