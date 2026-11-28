/** Display a document image with optional caption and linked credit. */
import { cn } from "cn";
import type { DocumentImageProps } from "./types.js";

/**
 * Display a document image with optional caption and linked credit.
 *
 * The host supplies the image and accessible description. The figure keeps them together with any caption and attribution.
 *
 * @param props Content and attributes for the root element.
 * @returns The rendered DocumentImage.
 * @example
 * <DocumentImage src="/field-study.svg" alt="Field study sketches" />
 */
export function DocumentImage({
  src,
  alt,
  caption,
  attribution,
  className,
  ...rest
}: DocumentImageProps) {
  const figureClassName = "cu-figure";
  return (
    <figure {...rest} className={cn(figureClassName, className)}>
      <img src={src} alt={alt} />
      {(caption || attribution) && (
        <figcaption>
          {caption} {attribution && <a href={attribution.href}>{attribution.label}</a>}
        </figcaption>
      )}
    </figure>
  );
}
