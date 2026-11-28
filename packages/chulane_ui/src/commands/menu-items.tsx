/** Shares row geometry, icons and keyboard hints across both Radix menu surfaces. */
import { ScrollArea } from "../components/ui/scroll-area.js";
import { Kbd } from "../components/ui/kbd.js";
import type * as Drop from "../components/ui/dropdown-menu.js";
import type { MenuEntry } from "./types.js";

export function MenuItems({
  menu: Menu,
  items,
  host,
}: {
  menu: {
    Sub: typeof Drop.DropdownMenuSub;
    SubTrigger: typeof Drop.DropdownMenuSubTrigger;
    Portal: typeof Drop.DropdownMenuPortal;
    SubContent: typeof Drop.DropdownMenuSubContent;
    Item: typeof Drop.DropdownMenuItem;
    CheckboxItem: typeof Drop.DropdownMenuCheckboxItem;
  };
  items: MenuEntry[];
  host: HTMLElement | null;
}) {
  const row = "cu-menu-item";
  const surface = "cu-menu";
  const caption = "cu-meta";
  return items.map((item) => {
    const label = (
      <>
        {item.icon ? (
          <item.icon aria-hidden />
        ) : (
          <span aria-hidden className="cu-menu-icon-space" />
        )}
        <span className="cu-menu-label">
          {item.label}
          {"description" in item && item.description && (
            <small className={caption}>{item.description}</small>
          )}
        </span>
      </>
    );
    if ("items" in item) {
      return (
        <Menu.Sub key={item.id}>
          <Menu.SubTrigger className={row}>{label}</Menu.SubTrigger>
          <Menu.Portal container={host}>
            <Menu.SubContent className={surface}>
              <ScrollArea className="cu-scroll-overlay">
                <MenuItems menu={Menu} items={item.items} host={host} />
              </ScrollArea>
            </Menu.SubContent>
          </Menu.Portal>
        </Menu.Sub>
      );
    }
    const props = {
      className: row,
      disabled: item.disabled,
      onSelect: item.run,
      "data-danger": item.destructive || undefined,
    };
    return item.checked === undefined ? (
      <Menu.Item key={item.id} {...props}>
        {label}
        {item.shortcut && <Kbd>{item.shortcut}</Kbd>}
      </Menu.Item>
    ) : (
      <Menu.CheckboxItem key={item.id} {...props} checked={item.checked}>
        {label}
      </Menu.CheckboxItem>
    );
  });
}
