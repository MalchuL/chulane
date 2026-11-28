/** Registry button with safe form defaults for workspace actions. */
import { Button as Control } from "../../components/ui/button.js";
import type { ButtonProps } from "./types.js";
export { buttonVariants } from "../../components/ui/button.js";
export type { ButtonProps } from "./types.js";

/** Keep toolbar actions from submitting the surrounding form. */
export function Button({ asChild, type, ...props }: ButtonProps) {
  return <Control {...props} asChild={asChild} type={type ?? (asChild ? undefined : "button")} />;
}
