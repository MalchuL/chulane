/** Wraps editable content with insertion, drag and menu affordances. */
import { cn } from "cn";
import { Ellipsis, GripVertical, Plus } from "lucide-react";
import { ActionMenu } from "../../commands/action-menu/action-menu.js";
import { ContextMenu } from "../../commands/context-menu/context-menu.js";
import { ButtonGroup } from "../../foundation/button-group/button-group.js";
import { IconButton } from "../../foundation/icon-button/icon-button.js";
import { useBlockMenu } from "./hooks.js";
import type { BlockControlsProps } from "./types.js";

type GutterProps = Pick<BlockControlsProps, "actions" | "onInsert" | "onHandleDragStart"> & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * Render the insertion button and draggable dropdown trigger.
 * @param props Gutter actions and the visibility state for the grip dropdown.
 * @returns The block's leading controls.
 */
function BlockGutter({ actions, onInsert, onHandleDragStart, open, onOpenChange }: GutterProps) {
  const controlsClassName = "cu-block-controls";
  return (
    <div className={controlsClassName}>
      <ButtonGroup label="Block actions">
        <IconButton label="Insert block" onClick={onInsert}>
          <Plus />
        </IconButton>
        <ActionMenu
          label="Block actions"
          items={actions}
          open={open}
          onOpenChange={onOpenChange}
          trigger={
            <IconButton
              label="Block actions"
              draggable={Boolean(onHandleDragStart)}
              onDragStart={onHandleDragStart}
            >
              <GripVertical />
            </IconButton>
          }
        />
      </ButtonGroup>
    </div>
  );
}

/**
 * Reveal insertion, drag and block actions around editable content.
 *
 * The host supplies the editor and commands. Both buttons share dropdown visibility, and opening
 * one anchors the dropdown there. A programmatic first open anchors to the grip. Right-click
 * and the keyboard context-menu shortcut open a separate context menu.
 * @param props The editor content, host actions, dropdown state and root attributes.
 * @returns The editable block with its adjacent controls.
 * @example
 * <BlockControls actions={[{ id: "remove", label: "Remove", onSelect: removeBlock }]}
 *   onInsert={insertBlock} open={actionsOpen} onOpenChange={setActionsOpen}>
 *   <textarea aria-label="Block text" />
 * </BlockControls>
 */
export function BlockControls({
  children,
  actions,
  onInsert,
  onHandleDragStart,
  open,
  onOpenChange,
  className,
  ...rest
}: BlockControlsProps) {
  const blockClassName = "cu-block";
  const moreClassName = "cu-block-more";
  const { anchor, menuOpen, changeOpen } = useBlockMenu(open, onOpenChange);
  return (
    <div {...rest} className={cn(blockClassName, className)}>
      <BlockGutter
        actions={actions}
        onInsert={onInsert}
        onHandleDragStart={onHandleDragStart}
        open={menuOpen && anchor === "grip"}
        onOpenChange={(nextOpen) => changeOpen("grip", nextOpen)}
      />
      <ContextMenu label="Block context menu" items={actions}>
        {children}
      </ContextMenu>
      <div className={moreClassName}>
        <ActionMenu
          label="More block actions"
          items={actions}
          open={menuOpen && anchor === "more"}
          onOpenChange={(nextOpen) => changeOpen("more", nextOpen)}
          trigger={
            <IconButton label="More block actions">
              <Ellipsis />
            </IconButton>
          }
        />
      </div>
    </div>
  );
}
