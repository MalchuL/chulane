/** Displays queued requests and keeps unsaved queue edits local to each queue instance. */
import { cn } from "cn";
import { Pencil, Trash2, CornerUpRight } from "lucide-react";
import type { Ref } from "react";
import { Item } from "../../components/ui/item.js";
import { ScrollArea } from "../../components/ui/scroll-area.js";
import { Button } from "../../foundation/button/button.js";
import { ButtonGroup } from "../../foundation/button-group/button-group.js";
import { IconButton } from "../../foundation/icon-button/icon-button.js";
import { TextArea } from "../../foundation/text-area/text-area.js";
import { useQueueEdit } from "./hooks.js";
import type { MessageQueueProps } from "./types.js";

type QueueEditorProps = {
  text: string;
  onTextChange: (text: string) => void;
  onCancel: () => void;
  onSave: () => void;
};
type QueueRowProps = {
  text: string;
  editButtonRef: Ref<HTMLButtonElement>;
  onEdit: () => void;
  onRemove: () => void;
  onSteer?: () => void;
};

/**
 * Show and edit queued messages independently of the active draft.
 *
 * The host owns saved requests and delivery. The queue owns the temporary edit buffer.
 * @param props Messages, host actions and scroll area attributes.
 * @returns The queue with inline editing controls.
 * @example
 * <MessageQueue items={queue} onEdit={saveQueuedText} onRemove={removeQueued} />
 */
export function MessageQueue({
  items,
  onEdit,
  onRemove,
  onSteer,
  onEditingChange,
  className,
  ...rest
}: MessageQueueProps) {
  const scrollClassName = "cu-queue-scroll";
  const stackClassName = "cu-stack";
  const cardClassName = "cu-card";
  const { editing, setEditing, finishEdit, restoreEditFocus, updateText } = useQueueEdit(
    items,
    onEditingChange,
  );
  return (
    <ScrollArea {...rest} className={cn(scrollClassName, className)}>
      <ul className={stackClassName} aria-label="Queued messages">
        {items.map((item) => (
          <Item asChild key={item.id}>
            <li className={cardClassName}>
              {editing?.id === item.id ? (
                <QueueEditor
                  text={editing.text}
                  onTextChange={updateText}
                  onCancel={finishEdit}
                  onSave={() => {
                    onEdit(item.id, editing.text);
                    finishEdit();
                  }}
                />
              ) : (
                <QueueRow
                  text={item.draft.text}
                  editButtonRef={(button) => restoreEditFocus(item.id, button)}
                  onEdit={() => setEditing({ id: item.id, text: item.draft.text })}
                  onSteer={onSteer && (() => onSteer(item.id))}
                  onRemove={() => onRemove(item.id)}
                />
              )}
            </li>
          </Item>
        ))}
      </ul>
    </ScrollArea>
  );
}

/**
 * Focus the newly opened editor and keep save disabled for blank text.
 * @param props The buffered text and callbacks for changing or closing the edit.
 * @returns The inline textarea and its actions.
 */
function QueueEditor({ text, onTextChange, onCancel, onSave }: QueueEditorProps) {
  return (
    <>
      <TextArea
        autoFocus
        label="Edit queued message"
        value={text}
        onChange={(event) => onTextChange(event.target.value)}
      />
      <ButtonGroup label="Edit actions">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button disabled={!text.trim()} onClick={onSave}>
          Save
        </Button>
      </ButtonGroup>
    </>
  );
}

/**
 * Show a queued request and attach its Edit button for focus restoration.
 * @param props The queued text, edit button ref and available actions.
 * @returns The queue row with its action group.
 */
function QueueRow({ text, editButtonRef, onEdit, onRemove, onSteer }: QueueRowProps) {
  const rowClassName = "cu-queue-row";
  return (
    <div className={rowClassName}>
      <span>{text}</span>
      <ButtonGroup label="Queued message actions">
        <IconButton ref={editButtonRef} label="Edit queued message" onClick={onEdit}>
          <Pencil />
        </IconButton>
        {onSteer && (
          <IconButton label="Steer current response" onClick={onSteer}>
            <CornerUpRight />
          </IconButton>
        )}
        <IconButton label="Remove queued message" onClick={onRemove}>
          <Trash2 />
        </IconButton>
      </ButtonGroup>
    </div>
  );
}
