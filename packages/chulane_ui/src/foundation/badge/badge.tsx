/** badge presentation and interaction contract. */
import { Badge as Tag } from "../../components/ui/badge.js";

import type { BadgeProps } from "./types.js";
export type { BadgeProps } from "./types.js";

/**
 * Label metadata or a state inside a document.
 * @param props Presentation values and host callbacks described by the public props type.
 * @returns The rendered Badge view.
 */
export function Badge({ children }: BadgeProps) {
  return <Tag variant="secondary">{children}</Tag>;
}
