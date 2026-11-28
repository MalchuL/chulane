/** Public contracts for rendering host-authored transcript messages. */
import type { ComponentProps, ReactNode } from "react";
import type { Command } from "../../commands/types.js";
import type { PageReference } from "../../document/breadcrumbs/types.js";
import type { ActivityTraceProps } from "../activity-trace/types.js";

/** Displayed delivery state of a message. */
export type AgentMessageStatus = "streaming" | "cancelled" | "failed" | "complete";

/** Message alignment and bubble presentation. */
export type AgentMessageSide = "user" | "assistant";

/** Message display values, actions and article attributes. */
export type AgentMessageProps = ComponentProps<"div"> & {
  /** Stable transcript scroll identifier. Optional for content outside a transcript. */
  messageId?: string;
  /** Aligns the message to the user or assistant side. Defaults to assistant. */
  side?: AgentMessageSide;
  /** Author name used in the heading and accessible article name. */
  author: string;
  /** Rich body content supplied by the host. */
  children: ReactNode;
  /** Optional commands displayed below the message. */
  actions?: Command[];
  /** Optional sources revealed through a disclosure. */
  references?: readonly PageReference[];
  /** Optional activity shown below the body. */
  activity?: ActivityTraceProps["activity"];
  /** Optional delivery state. Complete messages omit the status indicator. */
  status?: AgentMessageStatus;
  /** Hide the visible author while keeping the article's accessible name and status. Defaults to false. */
  hideAuthor?: boolean;
};
