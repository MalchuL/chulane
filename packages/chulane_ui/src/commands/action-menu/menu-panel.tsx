/** An always-visible command group for a menu overview. Submenus reuse the popup renderer. */
import { Button } from "../../foundation/button/button.js";
import { Kbd } from "../../components/ui/kbd.js";
import { Check, ChevronRight } from "lucide-react";
import { ActionMenu } from "./action-menu.js";
import type { ActionMenuProps } from "./types.js";

export function MenuPanel({ label, items, icon: Icon }: ActionMenuProps) {
  const panel = "cu-menu-panel";
  const row = "cu-menu-item";
  return (
    <section className={panel} aria-label={label}>
      <h3>
        {Icon && <Icon />}
        {label}
      </h3>
      {items.map((item) => {
        const content = (
          <>
            {item.icon ? (
              <item.icon aria-hidden />
            ) : (
              <span aria-hidden className="cu-menu-icon-space" />
            )}
            <span className="cu-menu-label">{item.label}</span>
          </>
        );
        return "items" in item ? (
          <ActionMenu
            key={item.id}
            label={item.label}
            items={item.items}
            trigger={
              <Button variant="ghost" type="button" className={row}>
                {content}
                <ChevronRight />
              </Button>
            }
          />
        ) : (
          <Button
            variant="ghost"
            type="button"
            key={item.id}
            className={row}
            disabled={item.disabled}
            aria-pressed={item.checked}
            data-danger={item.destructive || undefined}
            onClick={item.run}
          >
            {content}
            {item.shortcut && <Kbd>{item.shortcut}</Kbd>}
            {item.checked && <Check />}
          </Button>
        );
      })}
    </section>
  );
}
