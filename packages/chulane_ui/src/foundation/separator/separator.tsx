/** Visual and semantic dividers for menus, toolbars, and panels. */
import { cn } from "cn";
import { Separator as Divider } from "../../components/ui/separator.js";
import type { SeparatorProps } from "./types.js";

/**
 * Separate adjacent content with a themed divider.
 *
 * The host chooses the orientation and whether the separation should be
 * announced. Separator defaults to a decorative horizontal line.
 * @param props Divider orientation, accessibility mode, and root attributes.
 * @returns The divider.
 * @example
 * <Separator orientation="vertical" />
 */
export function Separator({ className, ...rest }: SeparatorProps) {
  const separatorClassName = "cu-separator";
  return <Divider {...rest} className={cn(separatorClassName, className)} />;
}
