/** text area presentation and interaction contract. */
import { Textarea } from "../../components/ui/textarea.js";
import type { TextAreaProps } from "./types.js";
export type { TextAreaProps } from "./types.js";

/**
 * Capture a multiline draft with native editing and selection.
 * @param props Presentation values and host callbacks described by the public props type.
 * @returns The rendered TextArea view.
 */
export function TextArea({ label, ...props }: TextAreaProps) {
  return <Textarea {...props} aria-label={label} />;
}
