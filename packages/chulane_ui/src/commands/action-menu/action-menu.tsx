/** action menu presentation and interaction contract. */
import { DropdownMenu as Primitive } from "radix-ui";
import { ScrollArea } from "../../components/ui/scroll-area.js";
import { usePortalHost } from "../../foundation/theme-scope/hooks.js";
import type { ActionMenuProps } from "./types.js";
import * as UI from "../../components/ui/dropdown-menu.js";
import { MenuPanel } from "./menu-panel.js";
import { MenuItems } from "../menu-items.js";

export type { ActionMenuProps } from "./types.js";
const parts = {
  Sub: UI.DropdownMenuSub,
  SubTrigger: UI.DropdownMenuSubTrigger,
  Portal: UI.DropdownMenuPortal,
  SubContent: UI.DropdownMenuSubContent,
  Item: UI.DropdownMenuItem,
  CheckboxItem: UI.DropdownMenuCheckboxItem,
};
/**
 * Use nested commands for infrequent actions and checked preferences.
 * @param props Presentation values and host callbacks described by the public props type.
 * @returns The rendered ActionMenu view.
 */
export function ActionMenu(props: ActionMenuProps) {
  const portalHost = usePortalHost();
  if (props.presentation === "panel") {
    return <MenuPanel {...props} />;
  }
  const { label, trigger, items, open, onOpenChange } = props;
  const menuClassName = "cu-menu";
  return (
    <UI.DropdownMenu open={open} onOpenChange={onOpenChange}>
      <UI.DropdownMenuTrigger asChild>{trigger}</UI.DropdownMenuTrigger>

      <Primitive.Portal container={portalHost}>
        <Primitive.Content
          align="start"
          data-slot="dropdown-menu-content"
          aria-label={label}
          className={menuClassName}
        >
          <ScrollArea className="cu-scroll-overlay">
            <UI.DropdownMenuGroup>
              <MenuItems menu={parts} items={items} host={portalHost} />
            </UI.DropdownMenuGroup>
          </ScrollArea>
        </Primitive.Content>
      </Primitive.Portal>
    </UI.DropdownMenu>
  );
}
