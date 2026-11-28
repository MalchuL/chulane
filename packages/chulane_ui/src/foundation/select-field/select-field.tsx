/** Renders a native single select with string options and Chulane styling. */
import { NativeSelect, NativeSelectOption } from "../../components/ui/native-select.js";
import type { SelectFieldProps } from "./types.js";

/**
 * Choose one option from a native select.
 *
 * The host supplies the options and can control the selection. The browser
 * handles form submission, keyboard navigation and the uncontrolled selection.
 *
 * @param props Accessible name, available options and native select attributes.
 * @returns The native select and its option elements.
 * @example
 * <SelectField label="Model" options={["Local", "Cloud"]} defaultValue="Local" />
 */
export function SelectField({ label, options, onValueChange, ...rest }: SelectFieldProps) {
  return (
    <NativeSelect
      {...rest}
      aria-label={label}
      onChange={onValueChange && ((event) => onValueChange(event.currentTarget.value))}
    >
      {options.map((option) => (
        <NativeSelectOption key={option} value={option}>
          {option}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  );
}
