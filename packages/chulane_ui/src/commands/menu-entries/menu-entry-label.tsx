/** Shared visual label for popup entries and inline command panels. */
import type { MenuEntry } from "../types.js";

/**
 * Render the entry label with an aligned icon slot and optional supporting text.
 * @param props The entry and whether its description is shown.
 * @returns The leading icon slot and wrapping label.
 */
export function MenuEntryLabel({
  entry,
  showDescription = true,
}: {
  entry: MenuEntry;
  showDescription?: boolean;
}) {
  const iconSpaceClassName = "cu-menu-icon-space";
  const labelClassName = "cu-menu-label wrap-anywhere";
  const descriptionClassName = "cu-meta";
  const { icon: Icon, label, description } = entry;
  return (
    <>
      {Icon ? <Icon aria-hidden /> : <span aria-hidden className={iconSpaceClassName} />}
      <span className={labelClassName}>
        {label}
        {showDescription && description && (
          <small className={descriptionClassName}>{description}</small>
        )}
      </span>
    </>
  );
}
