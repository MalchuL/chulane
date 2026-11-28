/** A sequence of user-visible activity descriptions from the host. */
export type ActivityEvent = {
  id: string;
  status?: "pending" | "running" | "complete" | "error";
  title: string;
  detail?: string;
} & ({ kind: "reasoning" | "task" | "plan" } | { kind: "tool"; input?: string; output?: string });
export type ActivityTraceProps = {
  activity: readonly (string | ActivityEvent)[];
};
