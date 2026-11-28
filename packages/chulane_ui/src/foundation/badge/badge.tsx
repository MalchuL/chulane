/** Compact metadata labels for documents and controls. */
import { cn } from "cn";
import type { BadgeProps } from "./types.js";

/**
 * Display a short metadata label or status.
 *
 * The host provides the label or status content. Badge provides its visual treatment.
 * @param props Span attributes and the content to display.
 * @returns A metadata label.
 * @example
 * <Badge>Fieldwork</Badge>
 */
export function Badge({ className, ...rest }: BadgeProps) {
  const badgeClassName = "cu-badge";
  return <span {...rest} data-slot="badge" className={cn(badgeClassName, className)} />;
}
