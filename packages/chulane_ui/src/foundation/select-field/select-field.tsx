/** select field presentation and interaction contract. */
import { NativeSelect, NativeSelectOption } from "../../components/ui/native-select.js";

import type { SelectFieldProps } from "./types.js";
export type { SelectFieldProps } from "./types.js";

/**
 * Choose one model, workspace or named setting.
 * @param props Presentation values and host callbacks described by the public props type.
 * @returns The rendered SelectField view.
 */
export function SelectField({ label, value, options, onChange }: SelectFieldProps) {
  return (
    <NativeSelect
      aria-label={label}

      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map((o) => (
        <NativeSelectOption key={o}>{o}</NativeSelectOption>
      ))}
    </NativeSelect>
  );
}
