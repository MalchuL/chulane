/** Defines the public text value contract for TextArea. */
import type { ComponentProps } from "react";

/** Native textarea attributes and the string value API. */
export type TextAreaProps = Omit<
  ComponentProps<"textarea">,
  "children" | "value" | "defaultValue"
> & {
  /** Accessible name. */
  label: string;
  /** Current text. Omit to let the browser own it. */
  value?: string;
  /** Initial uncontrolled text. Defaults to an empty string. */
  defaultValue?: string;
  /** Receives the next text after an edit. Defaults to no callback. */
  onValueChange?: (value: string) => void;
};
