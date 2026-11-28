/** Adapts the native input to Chulane's string value API. */
import type { ChangeEvent } from "react";
import { Input } from "../../components/ui/input.js";
import type { SearchFieldProps } from "./types.js";

/**
 * Filter or find items with a native search input.
 *
 * The host owns the search and any results. The input owns its text when used with an optional default value.
 *
 * @param props Accessible label, text value and native input attributes.
 * @returns The native input with Chulane styling.
 * @example
 * <SearchField label="Find pages" onValueChange={setQuery} />
 */
export function SearchField({
  label,
  placeholder = label,
  onValueChange,
  onChange,
  ...rest
}: SearchFieldProps) {
  /**
   * Reports the value and preserves any native change listener.
   * @param event The React change event from the input.
   */
  function change(event: ChangeEvent<HTMLInputElement>) {
    onValueChange?.(event.currentTarget.value);
    onChange?.(event);
  }

  return (
    <Input {...rest} aria-label={label} type="search" placeholder={placeholder} onChange={change} />
  );
}
