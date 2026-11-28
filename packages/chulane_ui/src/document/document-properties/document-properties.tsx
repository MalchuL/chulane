/** document properties presentation and interaction contract. */
import type { DocumentPropertiesProps } from "./types.js";
export type { DocumentPropertiesProps } from "./types.js";

/**
 * Display metadata, tags and readable linked-page references.
 * @param props Presentation values and host callbacks described by the public props type.
 * @returns The rendered DocumentProperties view.
 */
export function DocumentProperties({ properties }: DocumentPropertiesProps) {
  const propertiesClassName = "cu-properties";
  return (
    <dl className={propertiesClassName}>
      {properties.map((p) => (
        <div key={p.label}>
          <dt>{p.label}</dt>
          <dd>{p.value}</dd>
        </div>
      ))}
    </dl>
  );
}
