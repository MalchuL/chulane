/** Adapts the native textarea to Chulane's string value API. */
import type { ChangeEvent } from "react";
import { Textarea } from "../../components/ui/textarea.js";
import type { TextAreaProps } from "./types.js";

/**
 * Edit multiline text with native selection and keyboard behavior.
 *
 * The host decides when to save the draft. The textarea owns its text when used without a controlled value.
 *
 * @param props Accessible label, text value and native input attributes.
 * @returns The native textarea with Chulane styling.
 * @example
 * <TextArea label="Journal entry" defaultValue="Field notes" rows={4} />
 */
export function TextArea({ label, onValueChange, onChange, ...rest }: TextAreaProps) {
  /**
   * Reports the value and preserves any native change listener.
   * @param event The React change event from the textarea.
   */
  function change(event: ChangeEvent<HTMLTextAreaElement>) {
    onValueChange?.(event.currentTarget.value);
    onChange?.(event);
  }

  return <Textarea {...rest} aria-label={label} onChange={change} />;
}
