/** Binds host-owned draft changes to the composer and routes keyboard and form delivery. */
import type { FormEvent, KeyboardEvent } from "react";
import type { AgentComposerProps, AgentDraft } from "./types.js";

type ComposerDraftOptions = Pick<
  AgentComposerProps,
  "draft" | "onDraftChange" | "streaming" | "onSend" | "onQueue"
>;

/**
 * Derive draft edits and deliver nonblank text through the active host callback.
 * @param options Controlled draft and idle/streaming delivery callbacks.
 * @returns Draft update, submit and keyboard handlers plus delivery availability.
 */
export function useComposerDraft({
  draft,
  onDraftChange,
  streaming,
  onSend,
  onQueue,
}: ComposerDraftOptions) {
  const deliver = streaming ? onQueue : onSend;
  const canDeliver = Boolean(deliver && draft.text.trim());

  /** Merge a field edit into the controlled draft. */
  function updateDraft(change: Partial<AgentDraft>) {
    onDraftChange({ ...draft, ...change });
  }

  /** Deliver through the active callback and prevent native form navigation. */
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (canDeliver) {
      deliver?.();
    }
  }

  /** Submit on uncanceled plain Enter outside IME composition. */
  function onMessageKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      !event.defaultPrevented &&
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.ctrlKey &&
      !event.altKey &&
      !event.metaKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  return { updateDraft, submit, onMessageKeyDown, canDeliver, deliveryAvailable: Boolean(deliver) };
}
