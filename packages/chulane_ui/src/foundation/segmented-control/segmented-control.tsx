/** A visible single-choice control for a short set of options. */
import { cn } from "cn";
import { ToggleGroup, ToggleGroupItem } from "../../components/ui/toggle-group.js";
import type { SegmentedControlProps } from "./types.js";

/**
 * Keep a small set of mutually exclusive choices visible.
 *
 * The host owns the selected value. SegmentedControl provides keyboard navigation
 * and keeps the current selection when the user activates it again.
 * @param props The options, current value, change callback, and root attributes.
 * @returns A labeled group of single-choice toggle buttons.
 * @example
 * <SegmentedControl label="View" options={["List", "Grid"]} value={view} onValueChange={setView} />
 */
export function SegmentedControl({
  label,
  value,
  options,
  onValueChange,
  className,
  ...rest
}: SegmentedControlProps) {
  const groupClassName = "cu-segments";
  /**
   * Notify the host when Radix emits a selected option.
   * @param next The selected value or an empty string when Radix clears it.
   */
  function selectOption(next: string) {
    if (next) {
      onValueChange(next);
    }
  }

  return (
    <ToggleGroup
      {...rest}
      className={cn(groupClassName, className)}
      type="single"
      aria-label={label}
      value={value}
      onValueChange={selectOption}
    >
      {options.map((option) => (
        <ToggleGroupItem type="button" key={option} value={option}>
          {option}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
