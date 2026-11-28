/** Renders host-authored messages, their transcript placement and optional disclosures. */
import { cn } from "cn";
import { BookOpen } from "lucide-react";
import { useContext, useId } from "react";
import { CommandToolbar } from "../../commands/command-toolbar/command-toolbar.js";
import { Bubble, BubbleContent } from "../../components/ui/bubble.js";
import { MessageScrollerItem } from "../../components/ui/message-scroller.js";
import { Message, MessageHeader, MessageContent } from "../../components/ui/message.js";
import {
  TraceCollapsible,
  TraceCollapsibleTrigger,
  TraceCollapsibleContent,
} from "../../components/ui/trace.js";
import { ActivityTrace } from "../activity-trace/activity-trace.js";
import { InlineCitation } from "../inline-citation/inline-citation.js";
import { InTranscript } from "../panel/context.js";
import type { AgentMessageProps } from "./types.js";

type MessageDetailsProps = Pick<AgentMessageProps, "actions" | "references" | "activity">;

/**
 * Show rich content, citations and expandable agent activity.
 *
 * The host owns message data and actions. The message owns visual placement and disclosures.
 * @param props Message content, display options and article attributes.
 * @returns The message article, registered with the transcript when it has an identifier.
 * @example
 * <AgentMessage messageId="welcome" author="Workspace agent">How can I help?</AgentMessage>
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
  hideAuthor = false,
  className,
  ...rest
}: AgentMessageProps) {
  const messageClassName = "cu-message";
  const proseClassName = "cu-prose";
  const inTranscript = useContext(InTranscript);
  const labelId = useId();
  const row = (
    <Message
      role="article"
      align={side === "user" ? "end" : "start"}
      aria-labelledby={labelId}
      {...rest}
      className={cn(messageClassName, className)}
      data-hide-author={hideAuthor || undefined}
    >
      <span id={labelId} hidden>
        {author} message
      </span>
      <MessageContent>
        <MessageHeader>
          <strong>{author}</strong>{" "}
          {status && status !== "complete" && <small role="status">{status}</small>}
        </MessageHeader>
        <Bubble variant={side === "user" ? "secondary" : "ghost"}>
          <BubbleContent className={proseClassName}>{children}</BubbleContent>
        </Bubble>
        <MessageDetails actions={actions} references={references} activity={activity} />
      </MessageContent>
    </Message>
  );
  return messageId && inTranscript ? (
    <MessageScrollerItem messageId={messageId}>{row}</MessageScrollerItem>
  ) : (
    row
  );
}

/** Render the available sources, activity and actions below the message text. */
function MessageDetails({ actions, references, activity }: MessageDetailsProps) {
  const disclosureClassName = "cu-agent-disclosure";
  const toolbarClassName = "cu-toolbar";
  return (
    <>
      {!!references?.length && (
        <TraceCollapsible>
          <TraceCollapsibleTrigger className={disclosureClassName}>
            <BookOpen aria-hidden />
            Sources ({references.length})
          </TraceCollapsibleTrigger>
          <TraceCollapsibleContent>
            <nav className={toolbarClassName} aria-label="Citations">
              {references.map((reference) => (
                <InlineCitation key={reference.id} source={reference} />
              ))}
            </nav>
          </TraceCollapsibleContent>
        </TraceCollapsible>
      )}
      {activity && <ActivityTrace activity={activity} />}
      {!!actions?.length && <CommandToolbar label="Message actions" commands={actions} />}
    </>
  );
}
