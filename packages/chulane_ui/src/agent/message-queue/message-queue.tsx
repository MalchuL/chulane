/** message queue presentation and interaction contract. */
import { ScrollArea } from "../../components/ui/scroll-area.js";
import { ButtonGroup } from "../../foundation/button-group/button-group.js";

import { Item } from "../../components/ui/item.js";

import type { MessageQueueProps } from "./types.js";
import { useState } from "react";
import { Button } from "../../foundation/button/button.js";
import { TextArea } from "../../foundation/text-area/text-area.js";
import { IconButton } from "../../foundation/icon-button/icon-button.js";
import { Pencil, Trash2, CornerUpRight } from "lucide-react";

export type { QueuedMessage, MessageQueueProps } from "./types.js";

/**
 * Edit a queued message independently of the active draft.
 * @param props Presentation values and host callbacks described by the public props type.
 * @returns The rendered MessageQueue view.
 */
export function MessageQueue({
  items,
  onEdit,
  onRemove,
  onSteer,
  onEditingChange,
}: MessageQueueProps) {
  const stackClassName = "cu-stack";
  const cardClassName = "cu-card";
  const toolbarClassName = "cu-toolbar";
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  function edit(value: typeof editing) {
    setEditing(value);
    onEditingChange?.(value?.id ?? null);
  }
  return (
    <ScrollArea className="cu-queue-scroll">
      <ul className={stackClassName} aria-label="Queued messages">
        {items.map((item) => (
          <Item asChild key={item.id}>
            <li className={cardClassName}>
              {editing?.id === item.id ? (
                <>
                  <TextArea
                    label="Edit queued message"
                    value={editing.text}
                    onChange={(e) => setEditing({ ...editing, text: e.target.value })}
                  />
                  <ButtonGroup label="Edit actions">
                    <Button
                      disabled={!editing.text.trim()}
                      onClick={() => {
                        onEdit(item.id, editing.text);
                        edit(null);
                      }}
                    >
                      Save
                    </Button>
                    <Button variant="ghost" onClick={() => edit(null)}>
                      Cancel
                    </Button>
                  </ButtonGroup>
                </>
              ) : (
                <div className={toolbarClassName}>
                  <span>{item.draft.text}</span>
                  <ButtonGroup label="Queued message actions">
                    <IconButton
                      label="Edit queued message"
                      onClick={() => edit({ id: item.id, text: item.draft.text })}
                    >
                      <Pencil />
                    </IconButton>
                    {onSteer && (
                      <IconButton label="Steer current response" onClick={() => onSteer(item.id)}>
                        <CornerUpRight />
                      </IconButton>
                    )}
                    <IconButton label="Remove queued message" onClick={() => onRemove(item.id)}>
                      <Trash2 />
                    </IconButton>
                  </ButtonGroup>
                </div>
              )}
            </li>
          </Item>
        ))}
      </ul>
    </ScrollArea>
  );
}
