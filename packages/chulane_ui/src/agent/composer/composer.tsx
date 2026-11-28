/** Renders the controlled request editor, context chips and delivery toolbar in one form. */
import { cn } from "cn";
import { InputGroup, InputGroupTextarea } from "../../components/ui/input-group.js";
import { useComposerDraft } from "./hooks.js";
import { ComposerToolbar, ContextChips, modeDetails } from "./parts.js";
import type { AgentComposerProps } from "./types.js";

/**
 * Compose a multiline request with context, a mode and a model.
 *
 * The host owns the draft and delivery. The composer renders edits and routes submission.
 * @param props Form attributes, the current draft and host callbacks.
 * @returns The controlled composer form.
 * @example
 * <AgentComposer draft={draft} onDraftChange={setDraft} modes={modes}
 *   models={models} availableContext={context} onSend={send} onStop={stop} />
 */
export function AgentComposer({
  draft,
  onDraftChange,
  availableContext,
  models,
  modes,
  streaming,
  onSend,
  onStop,
  onQueue,
  onAttach,
  className,
  ...rest
}: AgentComposerProps) {
  const formClassName = "cu-composer-form";
  const composerClassName = "cu-composer";
  const { updateDraft, submit, onMessageKeyDown, canDeliver, deliveryAvailable } = useComposerDraft(
    { draft, onDraftChange, streaming, onSend, onQueue },
  );
  return (
    <form {...rest} className={cn(formClassName, className)} onSubmit={submit}>
      <InputGroup className={composerClassName}>
        <ContextChips
          context={draft.context}
          onRemove={(id) =>
            updateDraft({ context: draft.context.filter((item) => item.id !== id) })
          }
        />
        <InputGroupTextarea
          aria-label="Message"
          rows={2}
          placeholder={modeDetails(draft.mode)?.prompt ?? "Ask your workspace…"}
          value={draft.text}
          onChange={(event) => updateDraft({ text: event.target.value })}
          onKeyDown={onMessageKeyDown}
        />
        <ComposerToolbar
          {...{ draft, availableContext, models, modes, streaming, onStop, onAttach }}
          onDraftUpdate={updateDraft}
          canDeliver={canDeliver}
          deliveryAvailable={deliveryAvailable}
        />
      </InputGroup>
    </form>
  );
}
