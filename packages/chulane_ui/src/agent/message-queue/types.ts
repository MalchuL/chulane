/** Public data and callback contracts for message-queue. */

import type { AgentDraft } from "../composer/composer.js";
export type QueuedMessage = { id: string; draft: AgentDraft };
export type MessageQueueProps = {
  items: QueuedMessage[];
  onEdit: (id: string, text: string) => void;
  onRemove: (id: string) => void;
  /** Lets a host defer delivery while a queued draft is being edited. */
  onEditingChange?: (id: string | null) => void;
  onSteer?: (id: string) => void;
};
