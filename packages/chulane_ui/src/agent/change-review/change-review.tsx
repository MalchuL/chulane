/** change review presentation and interaction contract. */
import { Button } from "../../foundation/button/button.js";
import { ButtonGroup } from "../../foundation/button-group/button-group.js";

import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "../../components/ui/collapsible.js";
import { Item } from "../../components/ui/item.js";

import { ChangeDiff } from "../change-diff/change-diff.js";
import type { ChangeReviewProps } from "./types.js";
import { useState } from "react";
import {
  ListChecks,
  Check,
  X,
  FilePenLine,
  CircleCheck,
  CircleX,
  Undo2,
  RotateCw,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { IconButton } from "../../foundation/icon-button/icon-button.js";

export type { ChangeStatus, ProposedChange, ChangeReviewProps } from "./types.js";

/**
 * Inspect a diff and let the host confirm apply, dismiss or undo.
 * @param props Presentation values and host callbacks described by the public props type.
 * @returns The rendered ChangeReview view.
 */
export function ChangeReview({
  changes,
  buttonLayout,
  onApply,
  onDismiss,
  onUndo,
}: ChangeReviewProps) {
  const [open, setOpen] = useState(true);
  const review = "cu-review";
  const row = "cu-change";
  const line = "cu-change-row";
  const labels = "cu-change-label";
  const meta = "cu-meta";
  return (
    <Collapsible asChild open={open} onOpenChange={setOpen}>
      <section className={review} aria-label="Change review">
        <header className={line}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" aria-label={open ? "Collapse changes" : "Expand changes"}>
              {open ? <ChevronDown /> : <ChevronRight />}
              <ListChecks aria-hidden />
              Changes
            </Button>
          </CollapsibleTrigger>
          <small className={meta}>
            {changes.filter((c) => c.status === "applied").length}/{changes.length} applied
          </small>
        </header>
        <CollapsibleContent>
          {changes.map((c) => {
            const complete = c.status === "applied" || c.status === "dismissed";
            let StatusIcon = FilePenLine;
            if (c.status === "applied") {
              StatusIcon = CircleCheck;
            } else if (c.status === "dismissed") {
              StatusIcon = CircleX;
            }
            return (
              <Item asChild key={c.id}>
                <article className={row} data-status={c.status}>
                  <div className={line}>
                    <StatusIcon aria-hidden />
                    <div className={labels}>
                      <strong>{c.summary}</strong>
                      <small className={meta}>
                        {c.target.href ? (
                          <a href={c.target.href}>{c.target.label}</a>
                        ) : (
                          c.target.label
                        )}{" "}
                        · <span role="status">{c.status}</span>
                      </small>
                    </div>
                    {(c.status === "pending" || c.status === "failed") && (
                      <ButtonGroup label="Review actions" buttonLayout={buttonLayout}>
                        <IconButton
                          label={c.status === "failed" ? "Retry" : "Apply change"}
                          onClick={() => onApply(c.id)}
                        >
                          {c.status === "failed" ? <RotateCw /> : <Check />}
                        </IconButton>
                        <IconButton label="Dismiss" onClick={() => onDismiss(c.id)}>
                          <X />
                        </IconButton>
                      </ButtonGroup>
                    )}
                    {complete && onUndo && (
                      <IconButton label="Undo" onClick={() => onUndo(c.id)}>
                        <Undo2 />
                      </IconButton>
                    )}
                  </div>
                  {c.error && <p role="alert">{c.error}</p>}
                  <ChangeDiff compact key={c.status} before={c.before} after={c.after} />
                </article>
              </Item>
            );
          })}
        </CollapsibleContent>
      </section>
    </Collapsible>
  );
}
