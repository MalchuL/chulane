/** Public data and callback contracts for message. */
import type { ActivityTraceProps } from "../activity-trace/types.js";

import type { Command } from "../../commands/types.js";
import type { ReactNode } from "react";
import type { PageReference } from "../../document/breadcrumbs/breadcrumbs.js";
export type AgentMessageProps = {
  messageId?: string;
  side?: "user" | "assistant";
  author: string;
  children: ReactNode;
  actions?: Command[];
  references?: PageReference[];
  activity?: ActivityTraceProps["activity"];
  status?: "streaming" | "cancelled" | "failed" | "complete";
};
