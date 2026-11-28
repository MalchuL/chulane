/** Pointer and keyboard context menu with nested command groups. */
import { ContextMenu as Primitive } from "radix-ui";
import { Slot } from "radix-ui";
import { ScrollArea } from "../../components/ui/scroll-area.js";
import { usePortalHost } from "../../foundation/theme-scope/hooks.js";
import * as UI from "../../components/ui/context-menu.js";
import { MenuItems } from "../menu-items.js";
import type { ContextMenuProps } from "./types.js";
const parts = {
  Sub: UI.ContextMenuSub,
  SubTrigger: UI.ContextMenuSubTrigger,
  Portal: UI.ContextMenuPortal,
  SubContent: UI.ContextMenuSubContent,
  Item: UI.ContextMenuItem,
  CheckboxItem: UI.ContextMenuCheckboxItem,
};
/**
 * Offer the same commands through right-click, Shift + F10 or the context menu key.
 * @param props Presentation values and host callbacks described by the public props type.
 * @returns The rendered ContextMenu view.
 */
export function ContextMenu({ label, children, items, asChild }: ContextMenuProps) {
  const Trigger = asChild ? Slot.Root : "div";
  const portalHost = usePortalHost();
  const menuClassName = "cu-menu";
  return (
    <UI.ContextMenu>
      <UI.ContextMenuTrigger asChild>
        <Trigger
          aria-label={asChild ? undefined : label}
          role={asChild ? undefined : "group"}
          tabIndex={asChild ? undefined : 0}
          onKeyDown={(e) => {
            if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) {
              e.preventDefault();
              e.stopPropagation();
              const rect = e.currentTarget.getBoundingClientRect();
              e.currentTarget.dispatchEvent(
                new MouseEvent("contextmenu", {
                  bubbles: true,
                  clientX: rect.left,
                  clientY: rect.bottom,
                }),
              );
            }
          }}
        >
          {children}
        </Trigger>
      </UI.ContextMenuTrigger>

      <Primitive.Portal container={portalHost}>
        <Primitive.Content
          data-slot="context-menu-content"
          className={menuClassName}
          aria-label={label}
        >
          <ScrollArea className="cu-scroll-overlay">
            <UI.ContextMenuGroup>
              <MenuItems menu={parts} items={items} host={portalHost} />
            </UI.ContextMenuGroup>
          </ScrollArea>
        </Primitive.Content>
      </Primitive.Portal>
    </UI.ContextMenu>
  );
}
