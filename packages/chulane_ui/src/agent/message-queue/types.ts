/** Public contracts for queued requests and their host-owned operations. */
import type { ComponentProps } from "react";
import type { ScrollArea } from "../../components/ui/scroll-area.js";
import type { AgentDraft } from "../composer/index.js";

/** A draft captured in the host's delivery queue. */
export type QueuedMessage = {
  /** Stable queue identifier. */
  id: string;
  /** Request content and settings captured when the message was queued. */
  draft: AgentDraft;
};

/** Queued requests, their commands and scroll area attributes. */
export type MessageQueueProps = Omit<ComponentProps<typeof ScrollArea>, "children"> & {
  /** Messages in delivery order. */
  items: readonly QueuedMessage[];
  /** Commits edited request text for the given queued message. */
  onEdit: (id: string, text: string) => void;
  /** Removes the identified queued message. */
  onRemove: (id: string) => void;
  /** Reports the active edit ID and null when it ends, including on host removal or unmount. */
  onEditingChange?: (id: string | null) => void;
  /** Uses the queued request to steer the current response when supplied. */
  onSteer?: (id: string) => void;
};
