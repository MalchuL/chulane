/** Defines the public text value contract for SearchField. */
import type { ComponentProps } from "react";

/** Native input attributes and the string value API. */
export type SearchFieldProps = Omit<
  ComponentProps<"input">,
  "children" | "value" | "defaultValue" | "type"
> & {
  /** Accessible name, also used as the default placeholder. */
  label: string;
  /** Current text. Omit to let the browser own it. */
  value?: string;
  /** Initial uncontrolled text. Defaults to an empty string. */
  defaultValue?: string;
  /** Receives the next text after an edit. Defaults to no callback. */
  onValueChange?: (value: string) => void;
};
