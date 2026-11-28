/** Attaches nested Radix context actions to a pointer and keyboard target. */
import type { KeyboardEvent } from "react";
import { ContextMenu as Primitive, Slot } from "radix-ui";
import { ScrollArea } from "../../components/ui/scroll-area.js";
import { usePortalHost } from "../../foundation/theme-scope/hooks.js";
import * as UI from "../../components/ui/context-menu.js";
import { MenuItems } from "../menu-entries/menu-items.js";
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
 * Offer commands through right-click, Shift + F10 or the context menu key.
 *
 * The host supplies entries and the target content. The menu handles keyboard
 * positioning, nested navigation and dispatch to the selected command.
 * @param props Commands, accessible label and attributes for the trigger.
 * @returns A focusable target with a portaled context menu.
 * @example
 * <ContextMenu label="Page actions" items={[{ id: "copy", label: "Copy", onSelect: copyPage }]}>
 *   <p>Field notes</p>
 * </ContextMenu>
 */
export function ContextMenu({
  label,
  children,
  items,
  asChild = false,
  className,
  onKeyDown,
  ...rest
}: ContextMenuProps) {
  const Trigger = asChild ? Slot.Root : "div";
  /**
   * Compose the host handler with the context-menu keyboard shortcut.
   * @param event Keyboard event from the trigger.
   * @returns Nothing.
   */
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    onKeyDown?.(event);
    if (!event.defaultPrevented) {
      openFromKeyboard(event);
    }
  }

  return (
    <UI.ContextMenu>
      <UI.ContextMenuTrigger asChild>
        <Trigger
          aria-label={asChild ? undefined : label}
          role={asChild ? undefined : "group"}
          tabIndex={asChild ? undefined : 0}
          className={className}
          {...rest}
          onKeyDown={handleKeyDown}
        >
          {children}
        </Trigger>
      </UI.ContextMenuTrigger>

      <ContextMenuContent label={label} items={items} />
    </UI.ContextMenu>
  );
}

/**
 * Portal the named context menu and keep every submenu in the same theme scope.
 * @param props Accessible name and ordered entries.
 * @returns The context menu content.
 */
function ContextMenuContent({ label, items }: Pick<ContextMenuProps, "label" | "items">) {
  const portalHost = usePortalHost();
  const menuClassName =
    "cu-menu min-w-[min(var(--ui-menu-width),var(--radix-popper-available-width))]! max-w-(--radix-popper-available-width)";
  const scrollClassName = "cu-scroll-overlay";
  return (
    <Primitive.Portal container={portalHost}>
      <Primitive.Content
        data-slot="context-menu-content"
        className={menuClassName}
        aria-label={label}
      >
        <ScrollArea className={scrollClassName}>
          <UI.ContextMenuGroup>
            <MenuItems menu={parts} items={items} host={portalHost} />
          </UI.ContextMenuGroup>
        </ScrollArea>
      </Primitive.Content>
    </Primitive.Portal>
  );
}

/**
 * Open the Radix context menu at the target corner on a context-menu shortcut.
 * @param event The key event from the menu's trigger.
 * @returns Nothing.
 */
function openFromKeyboard(event: KeyboardEvent<HTMLElement>) {
  if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  const rect = event.currentTarget.getBoundingClientRect();
  event.currentTarget.dispatchEvent(
    new MouseEvent("contextmenu", {
      bubbles: true,
      clientX: rect.left,
      clientY: rect.bottom,
    }),
  );
}
