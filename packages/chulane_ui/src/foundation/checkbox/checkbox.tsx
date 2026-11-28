/** checkbox presentation and interaction contract. */
import { cn } from "cn";
import { useId } from "react";

import { Field, FieldLabel } from "../../components/ui/field.js";

import { Checkbox as Control } from "../../components/ui/checkbox.js";

import type { CheckboxProps } from "./types.js";
export type { CheckboxProps } from "./types.js";

/**
 * Expose an independent preference with a visible label.
 * @param props Presentation values and host callbacks described by the public props type.
 * @returns The rendered Checkbox view.
 */
export function Checkbox({ label, ...props }: CheckboxProps) {
  const generated = useId();
  const id = props.id ?? generated;
  const rowClassName = "cu-row";
  return (
    <Field orientation="horizontal" className={rowClassName}>
      <Control {...props} className={cn("cu-checkbox", props.className)} id={id} />
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
    </Field>
  );
}
