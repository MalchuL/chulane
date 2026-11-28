/** Host-owned proposals and commands for the change review panel. */
import type { ComponentProps } from "react";

/**
 * Lifecycle of a change as reported by the host.
 *
 * Pending and failed changes can be applied or dismissed. Applying and cancelled
 * changes have no row actions. Applied and dismissed changes count as reviewed
 * and offer undo when the host supplies it.
 */
export type ChangeStatus =
  "pending" | "applying" | "applied" | "dismissed" | "failed" | "cancelled";

/** The document or location affected by a proposal. */
export type ChangeTarget = {
  /** Display name of the affected location. */
  label: string;
  /** Destination of the target link. Defaults to plain text when omitted. */
  href?: string;
};

/** A host-owned proposal displayed throughout its review lifecycle. */
export type ProposedChange = {
  /** Stable identifier passed to all review callbacks. */
  id: string;
  /** Short description of the proposed edit. */
  summary: string;
  /** Location affected by the edit. */
  target: ChangeTarget;
  /** Current lifecycle status supplied by the host. */
  status: ChangeStatus;
  /** Original text from the affected location. */
  before: string;
  /** Proposed replacement text. */
  after: string;
  /** Host-provided error message. By default no alert is shown. */
  error?: string;
};

/** Review data, host commands and attributes for the root section. */
export type ChangeReviewProps = Omit<
  ComponentProps<"section">,
  "children" | "dangerouslySetInnerHTML"
> & {
  /** Proposals in display order. */
  changes: readonly ProposedChange[];
  /** Requests applying or retrying the change identified by the given ID. */
  onApply: (id: string) => void;
  /** Requests dismissing the change identified by the given ID. */
  onDismiss: (id: string) => void;
  /** Requests undoing the reviewed change with the given ID. Defaults to no undo action. */
  onUndo?: (id: string) => void;
};
