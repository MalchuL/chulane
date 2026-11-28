/** Host-owned activity entries accepted by the trace disclosure. */
import type { ComponentProps } from "react";

/** Progress of a reported activity event. */
export type ActivityStatus = "pending" | "running" | "complete" | "error";

/** Activity category, which determines the icon and whether tool data is supported. */
export type ActivityKind = "reasoning" | "task" | "plan" | "tool";

/** Fields shared by all structured activity events. */
type ActivityEventSummary = {
  /** Stable identifier for this event within the trace. */
  id: string;
  /** Host-reported progress. Defaults to an unlabeled event. */
  status?: ActivityStatus;
  /** Short user-facing event title. */
  title: string;
  /** Extra user-facing detail. Defaults to no detail. */
  detail?: string;
};

/** An activity event with a category and, for tools, optional input and output. */
export type ActivityEvent = ActivityEventSummary &
  (
    | {
        /** Category of a non-tool event. */
        kind: Exclude<ActivityKind, "tool">;
      }
    | {
        /** Tool invocation category. */
        kind: "tool";
        /** User-visible tool input. Defaults to no input section. */
        input?: string;
        /** User-visible tool output. Defaults to no output section. */
        output?: string;
      }
  );

/** A plain activity description or a structured event. */
export type ActivityEntry = string | ActivityEvent;

/** Trace entries and attributes for the root div. */
export type ActivityTraceProps = Omit<
  ComponentProps<"div">,
  "children" | "dangerouslySetInnerHTML"
> & {
  /** Entries in chronological display order. An empty list renders nothing. */
  activity: readonly ActivityEntry[];
};
