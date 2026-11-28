/** message presentation and interaction contract. */
import { InlineCitation } from "../inline-citation/inline-citation.js";
import {
  TraceCollapsible,
  TraceCollapsibleTrigger,
  TraceCollapsibleContent,
} from "../../components/ui/trace.js";
import { BookOpenText } from "lucide-react";
import { useContext } from "react";
import { InTranscript } from "../panel/context.js";
import { MessageScrollerItem } from "../../components/ui/message-scroller.js";

import { Bubble, BubbleContent } from "../../components/ui/bubble.js";

import { Message, MessageHeader, MessageContent } from "../../components/ui/message.js";

import { CommandToolbar } from "../../commands/command-toolbar/command-toolbar.js";
import { ActivityTrace } from "../activity-trace/activity-trace.js";
import type { AgentMessageProps } from "./types.js";
export type { AgentMessageProps } from "./types.js";

/**
 * Show rich content, human-readable citations and expandable agent activity.
 * @param props Presentation values and host callbacks described by the public props type.
 * @returns The rendered AgentMessage view.
 */
export function AgentMessage({
  author,
  messageId,
  side = "assistant",
  actions,
  children,
  references,
  activity,
  status,
}: AgentMessageProps) {
  const disclosureClassName = "cu-agent-disclosure";
  const messageClassName = "cu-message";
  const proseClassName = "cu-prose";
  const toolbarClassName = "cu-toolbar";
  const inTranscript = useContext(InTranscript);
  const row = (
    <Message
      role="article"
      align={side === "user" ? "end" : "start"}
      className={messageClassName}
      aria-label={author + " message"}
    >
      <MessageContent>
        <MessageHeader>
          <strong>{author}</strong>{" "}
          {status && status !== "complete" && <small role="status">{status}</small>}
        </MessageHeader>
        <Bubble variant={side === "user" ? "secondary" : "ghost"}>
          <BubbleContent className={proseClassName}>{children}</BubbleContent>
        </Bubble>
        {!!references?.length && (
          <TraceCollapsible>
            <TraceCollapsibleTrigger className={disclosureClassName}>
              <BookOpenText aria-hidden />
              Sources ({references.length})
            </TraceCollapsibleTrigger>
            <TraceCollapsibleContent>
              <nav className={toolbarClassName} aria-label="Citations">
                {references.map((r) => (
                  <InlineCitation key={r.id} source={r} />
                ))}
              </nav>
            </TraceCollapsibleContent>
          </TraceCollapsible>
        )}
        {activity && <ActivityTrace activity={activity} />}
        {actions?.length ? <CommandToolbar label="Message actions" commands={actions} /> : null}
      </MessageContent>
    </Message>
  );
  return messageId && inTranscript ? (
    <MessageScrollerItem messageId={messageId}>{row}</MessageScrollerItem>
  ) : (
    row
  );
}
