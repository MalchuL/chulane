/** Host-owned source and anchor attributes for an inline citation. */
import type { ComponentProps } from "react";

/** The display text, destination and optional preview of a citation. */
export type CitationSource = {
  /** Text shown in the inline link and its preview. */
  label: string;
  /** Link destination, also shown as the preview fallback. */
  href: string;
  /** Text shown in the preview. Defaults to the destination href. */
  description?: string;
};

/** Citation data and attributes for its root anchor. */
export type InlineCitationProps = Omit<
  ComponentProps<"a">,
  "children" | "dangerouslySetInnerHTML" | "href"
> & {
  /** Source displayed by the link and its preview. */
  source: CitationSource;
};
