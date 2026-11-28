/** Defines the checkbox state and the attributes for its row and control. */
import type { Checkbox } from "../../components/ui/checkbox.js";
import type { ComponentProps } from "react";

/** A checkbox can be checked, unchecked or mixed. */
export type CheckboxCheckedState = NonNullable<ComponentProps<typeof Checkbox>["checked"]>;

/** Row attributes plus the checkbox value and native control attributes. */
export type CheckboxProps = Omit<ComponentProps<"div">, "children"> & {
  /** Visible label associated with the checkbox. */
  label: string;
  /** Current checked state. Omit to let the checkbox own the state. */
  checked?: CheckboxCheckedState;
  /** Initial uncontrolled checked state. Defaults to false. */
  defaultChecked?: CheckboxCheckedState;
  /** Receives the next checked state. Defaults to no callback. */
  onCheckedChange?: (checked: CheckboxCheckedState) => void;
  /** Disables toggling. Defaults to false. */
  disabled?: boolean;
  /** Native button and form attributes for the checkbox itself. Defaults to none. */
  controlProps?: Omit<
    ComponentProps<typeof Checkbox>,
    "asChild" | "children" | "checked" | "defaultChecked" | "onCheckedChange" | "disabled"
  >;
};
