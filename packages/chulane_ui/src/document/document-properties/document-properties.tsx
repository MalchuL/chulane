/** Display metadata as a description list. */
import { cn } from "cn";
import type { DocumentPropertiesProps } from "./types.js";

/**
 * Display metadata as a description list.
 *
 * The host supplies the labels and rendered values. The component aligns them in shared columns.
 *
 * @param props Content and attributes for the root element.
 * @returns The rendered DocumentProperties.
 * @example
 * <DocumentProperties properties={[{ label: "Status", value: "Draft" }]} />
 */
export function DocumentProperties({ properties, className, ...rest }: DocumentPropertiesProps) {
  const propertiesClassName = "cu-properties";
  return (
    <dl {...rest} className={cn(propertiesClassName, className)}>
      {properties.map((p) => (
        <div key={p.label}>
          <dt>{p.label}</dt>
          <dd>{p.value}</dd>
        </div>
      ))}
    </dl>
  );
}
