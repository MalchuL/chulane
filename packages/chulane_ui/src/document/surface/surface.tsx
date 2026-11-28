/** Lays out host-supplied document content in a semantic reading surface. */
import { cn } from "cn";
import type { DocumentSurfaceProps } from "./types.js";

/**
 * Render a document heading, properties and body in reading order.
 *
 * The host supplies document content. The surface supplies article semantics and reading width.
 * @param props The heading, content, width preference and article attributes.
 * @returns The document article.
 * @example
 * <DocumentSurface heading="Field notes"><p>Observations from the coast.</p></DocumentSurface>
 */
export function DocumentSurface({
  heading,
  properties,
  children,
  fullWidth = false,
  className,
  ...rest
}: DocumentSurfaceProps) {
  const documentClassName = "cu-document";
  const proseClassName = "cu-prose";
  return (
    <article {...rest} className={cn(documentClassName, className)} data-wide={fullWidth}>
      <h1>{heading}</h1>
      {properties}
      <div className={proseClassName}>{children}</div>
    </article>
  );
}
