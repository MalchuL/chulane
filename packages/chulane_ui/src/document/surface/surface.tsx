/** surface presentation and interaction contract. */
import type { DocumentSurfaceProps } from "./types.js";
export type { DocumentSurfaceProps } from "./types.js";

/**
 * Keep title, properties and body in one readable scrolling surface.
 * @param props Presentation values and host callbacks described by the public props type.
 * @returns The rendered DocumentSurface view.
 */
export function DocumentSurface({ title, properties, children, fullWidth }: DocumentSurfaceProps) {
  const documentClassName = "cu-document";
  const proseClassName = "cu-prose";
  return (
    <article className={documentClassName} data-wide={fullWidth}>
      <h1>{title}</h1>
      {properties}
      <div className={proseClassName}>{children}</div>
    </article>
  );
}
