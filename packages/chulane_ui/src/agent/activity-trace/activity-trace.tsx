/** Collapsed activity disclosure within an agent response. */
import { cn } from "cn";
import { Activity, Brain, ClipboardList, ListChecks, Terminal } from "lucide-react";
import {
  Trace,
  TraceLine,
  TraceTitle,
  TraceIcon,
  TraceDescription,
  TraceCollapsible,
  TraceCollapsibleTrigger,
  TraceCollapsibleContent,
} from "../../components/ui/trace.js";
import type { ActivityEvent, ActivityKind, ActivityTraceProps } from "./types.js";

const activityIcons = {
  reasoning: Brain,
  task: ListChecks,
  plan: ClipboardList,
  tool: Terminal,
} satisfies Record<ActivityKind, typeof Activity>;

/**
 * Display the host's activity state. Tool input and output are revealed on demand.
 * @param props - The event supplied with the message.
 * @returns A trace row, with a disclosure when the host has supplied details.
 */
function ActivityRow({ event }: { event: ActivityEvent }) {
  const Icon = activityIcons[event.kind];
  const line = (
    <TraceLine status={event.status === "complete" ? undefined : event.status}>
      <TraceIcon>
        <Icon />
      </TraceIcon>
      <TraceTitle title={event.title}>{event.title}</TraceTitle>
      {event.status && <TraceDescription>{event.status}</TraceDescription>}
    </TraceLine>
  );
  const toolData =
    event.kind === "tool" && (event.input !== undefined || event.output !== undefined);
  if (!event.detail && !toolData) {
    return line;
  }
  return (
    <TraceCollapsible>
      <TraceCollapsibleTrigger>{line}</TraceCollapsibleTrigger>
      <TraceCollapsibleContent>
        {event.detail && <p>{event.detail}</p>}
        {event.kind === "tool" && event.input !== undefined && (
          <div>
            Input<pre>{event.input}</pre>
          </div>
        )}
        {event.kind === "tool" && event.output !== undefined && (
          <div>
            Output<pre>{event.output}</pre>
          </div>
        )}
      </TraceCollapsibleContent>
    </TraceCollapsible>
  );
}

/**
 * Displays a chronological list of agent activity with expandable details.
 *
 * The host supplies display-ready descriptions, statuses and tool data. The
 * component controls which details are expanded and starts collapsed.
 *
 * @param props Activity entries and the attributes forwarded to the root div.
 * @returns A trace disclosure when there are entries, or null for an empty list.
 * @example
 * <ActivityTrace activity={[{ id: "read", kind: "tool", title: "Read entry", status: "complete" }]} />
 */
export function ActivityTrace({ activity, className, ...rest }: ActivityTraceProps) {
  const disclosureClassName = "cu-agent-disclosure";
  const traceClassName = "cu-trace";
  if (activity.length === 0) {
    return null;
  }
  return (
    <TraceCollapsible {...rest} className={cn(traceClassName, className)}>
      <TraceCollapsibleTrigger className={disclosureClassName}>
        <Activity aria-hidden />
        Activity ({activity.length})
      </TraceCollapsibleTrigger>
      <TraceCollapsibleContent>
        <Trace>
          {activity.map((entry, index) =>
            typeof entry === "string" ? (
              <TraceLine key={`description:${index}`}>
                <TraceTitle title={entry}>{entry}</TraceTitle>
              </TraceLine>
            ) : (
              <ActivityRow key={`event:${entry.id}`} event={entry} />
            ),
          )}
        </Trace>
      </TraceCollapsibleContent>
    </TraceCollapsible>
  );
}
