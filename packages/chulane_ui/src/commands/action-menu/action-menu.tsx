/** Anchors host-owned actions to a trigger or shows them as a persistent panel. */
import { cn } from "cn";
import { DropdownMenu as Primitive } from "radix-ui";
import { ScrollArea } from "../../components/ui/scroll-area.js";
import * as UI from "../../components/ui/dropdown-menu.js";
import { usePortalHost } from "../../foundation/theme-scope/hooks.js";
import { MenuItems } from "../menu-entries/menu-items.js";
import { MenuPanel } from "./menu-panel.js";
import type { ActionMenuProps } from "./types.js";

const parts = {
  Sub: UI.DropdownMenuSub,
  SubTrigger: UI.DropdownMenuSubTrigger,
  Portal: UI.DropdownMenuPortal,
  SubContent: UI.DropdownMenuSubContent,
  Item: UI.DropdownMenuItem,
  CheckboxItem: UI.DropdownMenuCheckboxItem,
};

/**
 * Present infrequent actions and preferences in a popup or inline panel.
 *
 * The host owns commands, checked state and optionally popup visibility. The menu
 * renders nested entries, handles focus and requests selection through each command.
 * @param props The entries and presentation-specific trigger or panel options.
 * @returns The menu in the requested presentation.
 * @example
 * <ActionMenu
 *   label="Page actions"
 *   trigger={<button type="button">Actions</button>}
 *   items={[{ id: "duplicate", label: "Duplicate", onSelect: duplicatePage }]}
 * />
 */
export function ActionMenu(props: ActionMenuProps) {
  if (props.presentation === "panel") {
    return <MenuPanel {...props} />;
  }
  return <ActionMenuPopup {...props} />;
}

/**
 * Anchor the popup to the supplied trigger and portal the content into its theme scope.
 * @param props The popup's trigger, visibility options, entries and content attributes.
 * @returns The trigger and portaled menu.
 */
function ActionMenuPopup({
  label,
  trigger,
  items,
  open,
  defaultOpen,
  onOpenChange,
  presentation: _presentation,
  className,
  ...rest
}: Extract<ActionMenuProps, { trigger: unknown }>) {
  const portalHost = usePortalHost();
  const menuClassName =
    "cu-menu min-w-[min(var(--ui-menu-width),var(--radix-popper-available-width))]! max-w-(--radix-popper-available-width)";
  const scrollClassName = "cu-scroll-overlay";

  return (
    <UI.DropdownMenu open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
      <UI.DropdownMenuTrigger asChild>{trigger}</UI.DropdownMenuTrigger>
      <Primitive.Portal container={portalHost}>
        <Primitive.Content
          align="start"
          data-slot="dropdown-menu-content"
          aria-label={label}
          className={cn(menuClassName, className)}
          {...rest}
        >
          <ScrollArea className={scrollClassName}>
            <UI.DropdownMenuGroup>
              <MenuItems menu={parts} items={items} host={portalHost} />
            </UI.DropdownMenuGroup>
          </ScrollArea>
        </Primitive.Content>
      </Primitive.Portal>
    </UI.DropdownMenu>
  );
}
