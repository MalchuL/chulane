/** segmented control presentation and interaction contract. */
import type { SelectFieldProps } from "../select-field/select-field.js";
import { ToggleGroup, ToggleGroupItem } from "../../components/ui/toggle-group.js";
/**
 * Keep a small set of mutually exclusive display modes visible.
 * @param props Presentation values and host callbacks described by the public props type.
 * @returns The rendered SegmentedControl view.
 */
export function SegmentedControl({ label, value, options, onChange }: SelectFieldProps) {
  return (
    <ToggleGroup
      type="single"
      aria-label={label}
      value={value}
      onValueChange={(next) => {
        if (next) {
          onChange(next);
        }
      }}
    >
      {options.map((o) => (
        <ToggleGroupItem type="button" key={o} value={o}>
          {o}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
