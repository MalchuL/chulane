/** document image presentation and interaction contract. */
import type { DocumentImageProps } from "./types.js";
export type { DocumentImageProps } from "./types.js";

/**
 * Preserve image dimensions, caption and source attribution.
 * @param props Presentation values and host callbacks described by the public props type.
 * @returns The rendered DocumentImage view.
 */
export function DocumentImage({ src, alt, caption, attribution }: DocumentImageProps) {
  const figureClassName = "cu-figure";
  return (
    <figure className={figureClassName}>
      <img src={src} alt={alt} />
      <figcaption>
        {caption} {attribution && <a href={attribution.href}>{attribution.label}</a>}
      </figcaption>
    </figure>
  );
}
