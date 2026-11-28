/** Defines the native single-selection contract for SelectField. */
import type { NativeSelect } from "../../components/ui/native-select.js";
import type { ComponentProps } from "react";

/** Native single-select attributes and the string value API. */
export type SelectFieldProps = Omit<
  ComponentProps<typeof NativeSelect>,
  "children" | "value" | "defaultValue" | "onChange" | "multiple"
> & {
  /** Accessible name of the select. */
  label: string;
  /** Unique option strings, used as both display text and submitted values. */
  options: readonly string[];
  /** Selected value. Omit to let the browser own the selection. */
  value?: string;
  /** Initial uncontrolled selection. Defaults to the browser's first available option. */
  defaultValue?: string;
  /** Receives the next selected value. Defaults to no callback. */
  onValueChange?: (value: string) => void;
};
