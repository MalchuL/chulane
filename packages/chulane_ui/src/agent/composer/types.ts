/** Public contracts for a host-owned agent draft and the composer that edits it. */
import type { ComponentProps } from "react";

/** Selects the icon and semantics of an attached context item. */
export type ContextItemKind = "page" | "block" | "project" | "attachment";

/** A named workspace reference or attachment available to a draft. */
export type ContextItem = {
  /** Stable identifier shared by the context menu and chip. */
  id: string;
  /** Human-readable name displayed in the menu and chip. */
  label: string;
  /** Reference category. Defaults to page. */
  kind?: ContextItemKind;
};

/** The editable request state held by the host and captured when queuing a message. */
export type AgentDraft = {
  /** Multiline request text. */
  text: string;
  /** Context currently attached to the request, in display order. */
  context: readonly ContextItem[];
  /** Selected mode, identified by its displayed name. */
  mode: string;
  /** Selected model, identified by its unique label. */
  model: string;
};

/** Describes a selectable model and where it runs. */
export type ModelOption = {
  /** Unique name shown in the composer and stored on the draft. */
  label: string;
  /** Execution location used to select the model icon. */
  location: "device" | "local" | "cloud";
};

/** Controlled editor inputs, delivery callbacks and form attributes. */
export type AgentComposerProps = Omit<ComponentProps<"form">, "children" | "onSubmit"> & {
  /** The current draft, owned by the host. */
  draft: AgentDraft;
  /** Receives the complete next draft after a composer edit. */
  onDraftChange: (draft: AgentDraft) => void;
  /** Context that can be added from the attachment menu. */
  availableContext: readonly ContextItem[];
  /** Models shown in menu order. */
  models: readonly ModelOption[];
  /** Mode names shown in menu order. */
  modes: readonly string[];
  /** Whether a response is streaming. Defaults to false. */
  streaming?: boolean;
  /** Delivers the current draft while idle. */
  onSend: () => void;
  /** Stops the current response. */
  onStop: () => void;
  /** Receives selected files when provided and enables the attachment option. */
  onAttach?: (files: File[]) => void;
  /** Queues the current draft while streaming when provided. */
  onQueue?: () => void;
};
