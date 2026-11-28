/** Private review row, status and action rendering shared by the review panel. */
import { Check, CircleCheck, CircleX, FilePenLine, RotateCw, Undo2, X } from "lucide-react";
import { ButtonGroup } from "../../foundation/button-group/button-group.js";
import { IconButton } from "../../foundation/icon-button/icon-button.js";
import type { IconButtonProps } from "../../foundation/icon-button/types.js";
import { ChangeDiff } from "../change-diff/index.js";
import type { ChangeReviewProps, ChangeStatus, ProposedChange } from "./types.js";

type ChangeReviewRowProps = Pick<ChangeReviewProps, "onApply" | "onDismiss" | "onUndo"> & {
  change: ProposedChange;
};

const statusIcons = {
  pending: FilePenLine,
  applying: FilePenLine,
  applied: CircleCheck,
  dismissed: CircleX,
  failed: FilePenLine,
  cancelled: FilePenLine,
} satisfies Record<ChangeStatus, typeof FilePenLine>;

/**
 * Recognizes statuses that count toward the reviewed total and can offer undo.
 * @param status The current host-owned change status.
 * @returns Whether the host has applied or dismissed the change.
 */
export function isReviewed(status: ChangeStatus) {
  return status === "applied" || status === "dismissed";
}

/**
 * Displays a proposal, its current actions and any host-reported error.
 * @param props The proposal and callbacks for its review actions.
 * @returns A row with a diff disclosure that resets when the status changes.
 */
export function ChangeReviewRow({ change, onApply, onDismiss, onUndo }: ChangeReviewRowProps) {
  const rowClassName = "cu-change";
  const lineClassName = "cu-change-row";
  const StatusIcon = statusIcons[change.status];

  return (
    <article className={rowClassName} data-status={change.status}>
      <div className={lineClassName}>
        <StatusIcon aria-hidden />
        <ChangeReviewLabel change={change} />
        <ChangeReviewActions
          change={change}
          onApply={onApply}
          onDismiss={onDismiss}
          onUndo={onUndo}
        />
      </div>
      {change.error && <p role="alert">{change.error}</p>}
      <ChangeDiff compact key={change.status} before={change.before} after={change.after} />
    </article>
  );
}

/**
 * Displays the summary, affected location and live status of a proposal.
 * @param props The host-owned proposal to describe.
 * @returns The row label with an optional link to the affected location.
 */
function ChangeReviewLabel({ change }: { change: ProposedChange }) {
  const labelClassName = "cu-change-label";
  const metaClassName = "cu-meta";
  const { summary, target, status } = change;
  return (
    <div className={labelClassName}>
      <strong title={summary}>{summary}</strong>
      <small className={metaClassName}>
        {target.href ? <a href={target.href}>{target.label}</a> : target.label}
        {" · "}
        <span role="status">{status}</span>
      </small>
    </div>
  );
}

/**
 * Presents the actions allowed by the current change status.
 * @param props The proposal and host callbacks that receive its ID.
 * @returns Apply and dismiss controls, an undo control, or no actions.
 */
function ChangeReviewActions({ change, onApply, onDismiss, onUndo }: ChangeReviewRowProps) {
  const primaryClassName = "cu-change-primary";
  const dismissClassName = "cu-change-dismiss";
  const { id, status } = change;
  const failed = status === "failed";
  let actions = null;
  if (status === "pending" || failed) {
    actions = (
      <ButtonGroup label="Review actions">
        <ChangeReviewAction
          label="Dismiss"
          className={dismissClassName}
          onClick={() => onDismiss(id)}
        >
          <X aria-hidden />
        </ChangeReviewAction>
        <ChangeReviewAction
          label={failed ? "Retry" : "Apply change"}
          className={primaryClassName}
          onClick={() => onApply(id)}
        >
          {failed ? <RotateCw aria-hidden /> : <Check aria-hidden />}
        </ChangeReviewAction>
      </ButtonGroup>
    );
  } else if (isReviewed(status) && onUndo) {
    actions = (
      <ChangeReviewAction label="Undo" onClick={() => onUndo(id)}>
        <Undo2 aria-hidden />
      </ChangeReviewAction>
    );
  }
  return actions;
}

/**
 * Places a review button's tooltip below the row to clear the review count.
 * @param props The action's accessible label, icon and button attributes.
 * @returns A compact action with a tooltip in the current theme's portal.
 */
function ChangeReviewAction(props: IconButtonProps) {
  return <IconButton {...props} size="icon-xs" tooltipSide="bottom" />;
}
