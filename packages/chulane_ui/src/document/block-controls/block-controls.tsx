/** block controls presentation and interaction contract. */
import { ButtonGroup } from "../../foundation/button-group/button-group.js";

import { ContextMenu } from "../../commands/context-menu/context-menu.js";
import type { BlockControlsProps } from "./types.js";
import { GripVertical, Plus, Ellipsis } from "lucide-react";
import { IconButton } from "../../foundation/icon-button/icon-button.js";
import { ActionMenu } from "../../commands/action-menu/action-menu.js";

export type { BlockControlsProps } from "./types.js";
/**
 * Reveal insertion and block actions on hover or keyboard focus.
 * @param props Presentation values and host callbacks described by the public props type.
 * @returns The rendered BlockControls view.
 */
export function BlockControls({ children, actions, onInsert, onDragStart }: BlockControlsProps) {
  const blockClassName = "cu-block";
  const blockControlsClassName = "cu-block-controls";
  const more = "cu-block-more";
  return (
    <div className={blockClassName}>
      <div className={blockControlsClassName}>
        <ButtonGroup label="Block actions">
          <IconButton label="Insert block" onClick={onInsert}>
            <Plus />
          </IconButton>
          <ActionMenu
            label="Block actions"
            items={actions}
            trigger={
              <IconButton label="Block actions" draggable={!!onDragStart} onDragStart={onDragStart}>
                <GripVertical />
              </IconButton>
            }
          />
        </ButtonGroup>
      </div>
      <ContextMenu label="Block context menu" items={actions}>
        {children}
      </ContextMenu>
      <div className={more}>
        <ActionMenu
          label="More block actions"
          items={actions}
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
