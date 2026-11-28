/** Renders nested entries with the Radix primitives supplied by each menu surface. */
import { ScrollArea } from "../../components/ui/scroll-area.js";
import { Kbd } from "../../components/ui/kbd.js";
import type * as Drop from "../../components/ui/dropdown-menu.js";
import type { Command, MenuEntry } from "../types.js";
import { MenuEntryLabel } from "./menu-entry-label.js";

type MenuParts = {
  Sub: typeof Drop.DropdownMenuSub;
  SubTrigger: typeof Drop.DropdownMenuSubTrigger;
  Portal: typeof Drop.DropdownMenuPortal;
  SubContent: typeof Drop.DropdownMenuSubContent;
  Item: typeof Drop.DropdownMenuItem;
  CheckboxItem: typeof Drop.DropdownMenuCheckboxItem;
};

type MenuEntriesProps = {
  menu: MenuParts;
  items: readonly MenuEntry[];
  host: HTMLElement | null;
};

/**
 * Render sibling entries in host order, using the supplied portal host at each submenu level.
 * @param props Entries, menu primitives and their shared portal host.
 * @returns A list of action rows and submenu triggers.
 */
export function MenuItems({ menu, items, host }: MenuEntriesProps) {
  return items.map((entry) => {
    if ("items" in entry) {
      return <SubmenuEntry key={entry.id} menu={menu} host={host} entry={entry} />;
    }
    return <MenuCommand key={entry.id} menu={menu} command={entry} />;
  });
}

/**
 * Render a submenu under its own focusable trigger and keep it in the parent's theme scope.
 * @param props The submenu, menu primitives and portal host.
 * @returns The paired submenu trigger and content.
 */
function SubmenuEntry({
  menu: Menu,
  host,
  entry,
}: Omit<MenuEntriesProps, "items"> & { entry: Exclude<MenuEntry, Command> }) {
  const rowClassName = "cu-menu-item";
  const menuClassName =
    "cu-menu min-w-[min(var(--ui-menu-width),var(--radix-popper-available-width))]! max-w-(--radix-popper-available-width)";
  const scrollClassName = "cu-scroll-overlay";
  return (
    <Menu.Sub>
      <Menu.SubTrigger className={rowClassName} textValue={entry.label}>
        <MenuEntryLabel entry={entry} />
      </Menu.SubTrigger>
      <Menu.Portal container={host}>
        <Menu.SubContent className={menuClassName}>
          <ScrollArea className={scrollClassName}>
            <MenuItems menu={Menu} items={entry.items} host={host} />
          </ScrollArea>
        </Menu.SubContent>
      </Menu.Portal>
    </Menu.Sub>
  );
}

/**
 * Render a regular command or a controlled checkbox entry from the same command record.
 * @param props The command and owning menu primitives.
 * @returns A selectable Radix item honoring enabled and checked state.
 */
function MenuCommand({ menu: Menu, command }: { menu: MenuParts; command: Command }) {
  const rowClassName = "cu-menu-item";
  const shortcutClassName = "shrink-0";
  const { checked, disabled, destructive, label, onSelect, shortcut } = command;
  const props = {
    className: rowClassName,
    disabled,
    onSelect,
    textValue: label,
    "data-danger": destructive || undefined,
    children: (
      <>
        <MenuEntryLabel entry={command} />
        {shortcut && <Kbd className={shortcutClassName}>{shortcut}</Kbd>}
      </>
    ),
  };
  if (checked === undefined) {
    return <Menu.Item {...props} />;
  }
  return <Menu.CheckboxItem {...props} checked={checked} />;
}
