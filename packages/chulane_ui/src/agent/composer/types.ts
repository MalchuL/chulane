/** Public data and callback contracts for composer. */

export type ContextItem = {
  id: string;
  label: string;
  kind?: "page" | "project" | "attachment";
};
export type AgentDraft = {
  text: string;
  context: ContextItem[];
  mode: string;
  model: string;
};
export type ModelOption = { label: string; location: "device" | "local" | "cloud" };
export type AgentComposerProps = {
  draft: AgentDraft;
  onChange: (value: AgentDraft) => void;
  availableContext: ContextItem[];
  models: readonly (string | ModelOption)[];
  modes: string[];
  streaming?: boolean;
  onSend: () => void;
  onStop: () => void;
  onAttach?: (files: File[]) => void;
  onQueue?: () => void;
};
