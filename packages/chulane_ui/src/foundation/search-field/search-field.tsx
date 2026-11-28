/** search field presentation and interaction contract. */
import { Input } from "../../components/ui/input.js";
import type { SearchFieldProps } from "./types.js";
export type { SearchFieldProps } from "./types.js";

/**
 * Filter a collection while keeping keyboard focus in its search field.
 * @param props Presentation values and host callbacks described by the public props type.
 * @returns The rendered SearchField view.
 */
export function SearchField({ label, ...props }: SearchFieldProps) {
  return (
    <Input
      {...props}

      type="search"
      aria-label={label}
      placeholder={props.placeholder ?? label}
    />
  );
}
