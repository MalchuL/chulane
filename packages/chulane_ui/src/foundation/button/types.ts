/** Public attributes and appearance options for Button. */
import type { ComponentProps } from "react";
import type { Button } from "../../components/ui/button.js";

/** Props for an action button, including native button attributes. */
export type ButtonProps = ComponentProps<"button"> & {
  /** Apply the button styles and attributes to a single child. Defaults to false. */
  asChild?: boolean;
  /** Visual treatment. Defaults to "default". */
  variant?: ComponentProps<typeof Button>["variant"];
  /** Control size. Defaults to "default". */
  size?: ComponentProps<typeof Button>["size"];
};
