/** Tracks one temporary queue edit while leaving the active composer draft with the host. */
import { useLayoutEffect, useRef, useState } from "react";
import type { MessageQueueProps } from "./types.js";

type QueueEdit = { id: string; text: string };

/**
 * Publish committed edit IDs and release the host's pause if the queue unmounts.
 * @param id Active queue entry or null when no edit is open.
 * @param onEditingChange Optional notification of the active entry or the end of editing.
 */
function useEditNotification(
  id: string | null,
  onEditingChange: MessageQueueProps["onEditingChange"],
) {
  const reportedId = useRef<string | null>(null);
  const committedCallback = useRef(onEditingChange);

  useLayoutEffect(() => {
    // Teardown uses the last committed host callback, even when the edit ID stays the same.
    committedCallback.current = onEditingChange;
    if (reportedId.current !== id) {
      reportedId.current = id;
      onEditingChange?.(id);
    }
  }, [id, onEditingChange]);

  useLayoutEffect(() => {
    return () => {
      if (reportedId.current !== null) {
        reportedId.current = null;
        committedCallback.current?.(null);
      }
    };
  }, []);
}

/**
 * Own one local edit while its host item exists and restore focus after a local close.
 * @param items Current host-owned queue items.
 * @param onEditingChange Optional notification that controls the host's delivery pause.
 * @returns The edit buffer and operations for editing and restoring row focus.
 */
export function useQueueEdit(
  items: MessageQueueProps["items"],
  onEditingChange: MessageQueueProps["onEditingChange"],
) {
  const [editing, setEditing] = useState<QueueEdit | null>(null);
  const restoreFocusId = useRef<string | null>(null);
  const editingId = editing?.id ?? null;
  if (editingId !== null && !items.some((item) => item.id === editingId)) {
    // Discard the buffer before committing a queue where its item has disappeared.
    setEditing(null);
  }
  useEditNotification(editingId, onEditingChange);
  useLayoutEffect(() => {
    // A host may remove the row on save, leaving no button to attach in this commit.
    restoreFocusId.current = null;
  }, [editingId]);

  /** Close on Save or Cancel and request focus on the same row's Edit button. */
  function finishEdit() {
    restoreFocusId.current = editingId;
    setEditing(null);
  }

  /**
   * Focus a returning Edit button only after the user closes that row's editor.
   * @param id Queue row owning the button.
   * @param button The mounted Edit button, or null while it detaches.
   */
  function restoreEditFocus(id: string, button: HTMLButtonElement | null) {
    if (button && restoreFocusId.current === id) {
      restoreFocusId.current = null;
      button.focus();
    }
  }

  /**
   * Update unsaved text locally without notifying the delivery queue.
   * @param text The new contents of the editor.
   */
  function updateText(text: string) {
    setEditing((current) => (current ? { ...current, text } : current));
  }

  return { editing, setEditing, finishEdit, restoreEditFocus, updateText };
}
