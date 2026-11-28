/** Collapsed activity disclosure within an agent response. */
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

import { Activity, ListChecks, ClipboardList, Terminal, Brain } from "lucide-react";
import type { ActivityEvent, ActivityTraceProps } from "./types.js";
const activityIcons = { tool: Terminal, reasoning: Brain, task: ListChecks, plan: ClipboardList };

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
      <TraceTitle>{event.title}</TraceTitle>
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
 * Inspect a chronological list of agent actions.
 * @param props Presentation values and host callbacks described by the public props type.
 * @returns The rendered ActivityTrace view.
 */
export function ActivityTrace({ activity }: ActivityTraceProps) {
  const disclosureClassName = "cu-agent-disclosure";
  const traceClassName = "cu-trace";
  return activity.length ? (
    <TraceCollapsible className={traceClassName}>
      <TraceCollapsibleTrigger className={disclosureClassName}>
        <Activity aria-hidden />
        Activity ({activity.length})
      </TraceCollapsibleTrigger>
      <TraceCollapsibleContent>
        <Trace>
          {activity.map((line, i) =>
            typeof line === "string" ? (
              <TraceLine key={i}>
                <TraceTitle>{line}</TraceTitle>
              </TraceLine>
            ) : (
              <ActivityRow key={line.id} event={line} />
            ),
          )}
        </Trace>
      </TraceCollapsibleContent>
    </TraceCollapsible>
  ) : null;
}
