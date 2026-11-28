/** Pairs a Radix checkbox with a visible label in a Chulane field row. */
import { cn } from "cn";
import { useId } from "react";
import { Checkbox as Control } from "../../components/ui/checkbox.js";
import { Field, FieldLabel } from "../../components/ui/field.js";
import type { CheckboxProps } from "./types.js";

/**
 * Toggle a labeled preference, including a mixed state.
 *
 * The host can control the value or set its initial state. Radix handles keyboard
 * toggling and form integration, and the field associates the label with the control.
 *
 * @param props Checkbox state, label, and attributes for the row and control.
 * @returns The field row containing the label and checkbox.
 * @example
 * <Checkbox label="Show recent pages" defaultChecked controlProps={{ name: "showRecent" }} />
 */
export function Checkbox({
  label,
  className,
  checked,
  defaultChecked,
  onCheckedChange,
  disabled,
  controlProps,
  ...rest
}: CheckboxProps) {
  const generatedId = useId();
  const id = controlProps?.id ?? generatedId;
  const rowClassName = "cu-row";
  const controlClassName = "cu-checkbox";
  return (
    <Field
      {...rest}
      orientation="horizontal"
      data-disabled={disabled || undefined}
      className={cn(rowClassName, className)}
    >
      <Control
        {...controlProps}
        className={cn(controlClassName, controlProps?.className)}
        id={id}
        checked={checked}
        defaultChecked={defaultChecked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
      />
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
    </Field>
  );
}
