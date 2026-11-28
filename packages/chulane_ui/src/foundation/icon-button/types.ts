/** Public contract for a compact, named icon action. */
import type { ButtonProps } from "../button/types.js";
import type { TooltipProps } from "../tooltip/types.js";

/** Props for an icon button and its tooltip. */
export type IconButtonProps = Omit<
  ButtonProps,
  "aria-label" | "aria-labelledby" | "asChild" | "size" | "variant"
> & {
  /** Accessible name and visible tooltip text. */
  label: string;
  /** Control size. Defaults to "icon". */
  size?: ButtonProps["size"];
  /** Visual treatment. Defaults to "ghost". */
  variant?: ButtonProps["variant"];
  /** Preferred placement of the tooltip. Defaults to "top". */
  tooltipSide?: TooltipProps["side"];
  /** Whether the pointer can enter the tooltip without closing it. Defaults to false. */
  tooltipHoverable?: TooltipProps["hoverable"];
};
