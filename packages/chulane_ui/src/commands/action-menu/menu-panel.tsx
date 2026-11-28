/** Inline command group whose nested entries open the same popup as ActionMenu. */
import { cn } from "cn";
import { Check, ChevronRight } from "lucide-react";
import { Kbd } from "../../components/ui/kbd.js";
import { Button } from "../../foundation/button/button.js";
import { MenuEntryLabel } from "../menu-entries/menu-entry-label.js";
import type { MenuEntry } from "../types.js";
import { ActionMenu } from "./action-menu.js";
import type { ActionMenuProps } from "./types.js";

/**
 * Render an always-visible command section.
 * @param props Panel heading, entries and section attributes supplied by the host.
 * @returns A labeled section of buttons and submenu triggers.
 */
export function MenuPanel({
  label,
  items,
  icon: Icon,
  className,
  presentation: _presentation,
  ...rest
}: Extract<ActionMenuProps, { presentation: "panel" }>) {
  const panelClassName = "cu-menu-panel";
  const headingClassName = "min-w-0 wrap-anywhere";
  return (
    <section className={cn(panelClassName, className)} aria-label={label} {...rest}>
      <h3>
        {Icon && <Icon aria-hidden />}
        <span className={headingClassName}>{label}</span>
      </h3>
      {items.map((entry) => (
        <PanelEntry key={entry.id} entry={entry} />
      ))}
    </section>
  );
}

/**
 * Render an inline command button or a trigger for its nested menu.
 * @param props The host-owned entry displayed by this row.
 * @returns A button that selects the action or opens its submenu.
 */
function PanelEntry({ entry }: { entry: MenuEntry }) {
  const rowClassName = "cu-menu-item";
  const shortcutClassName = "shrink-0";
  const content = <MenuEntryLabel entry={entry} showDescription={false} />;
  if ("items" in entry) {
    return (
      <ActionMenu
        label={entry.label}
        items={entry.items}
        trigger={
          <Button variant="ghost" type="button" className={rowClassName}>
            {content}
            <ChevronRight aria-hidden />
          </Button>
        }
      />
    );
  }

  return (
    <Button
      variant="ghost"
      type="button"
      className={rowClassName}
      disabled={entry.disabled}
      aria-pressed={entry.checked}
      data-danger={entry.destructive || undefined}
      onClick={entry.onSelect}
    >
      {content}
      {entry.shortcut && <Kbd className={shortcutClassName}>{entry.shortcut}</Kbd>}
      {entry.checked && <Check aria-hidden />}
    </Button>
  );
}
