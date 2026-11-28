/** Public data and callback contracts for document-image. */

export type DocumentImageProps = {
  src: string;
  alt: string;
  caption?: string;
  attribution?: { label: string; href: string };
};
