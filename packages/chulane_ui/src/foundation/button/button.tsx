/** Registry button with safe form defaults for workspace actions. */
import { cn } from "cn";
import { Button as Control } from "../../components/ui/button.js";
import type { ButtonProps } from "./types.js";

export type { ButtonProps } from "./types.js";

/**
 * Render a button with shared interaction styles.
 *
 * The host owns the action and its state. Button defaults to a non-submit
 * control and supports styling a child element through asChild.
 * @param props Native button attributes and Chulane appearance options.
 * @returns The styled button or the supplied child element.
 * @example
 * <Button onClick={save}>Save changes</Button>
 */
export function Button({ asChild, className, type, ...rest }: ButtonProps) {
  const buttonClassName = "cu-button";
  let buttonType = type;
  if (!asChild && buttonType === undefined) {
    buttonType = "button";
  }
  return (
    <Control
      {...rest}
      asChild={asChild}
      className={cn(buttonClassName, className)}
      type={buttonType}
    />
  );
}
