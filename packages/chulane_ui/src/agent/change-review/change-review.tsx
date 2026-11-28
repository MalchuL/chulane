/** Hosts the review disclosure and renders host-owned proposals in order. */
import { cn } from "cn";
import { ChevronDown, ChevronRight, ListChecks } from "lucide-react";
import { useState } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../../components/ui/collapsible.js";
import { Button } from "../../foundation/button/button.js";
import { ChangeReviewRow, isReviewed } from "./parts.js";
import type { ChangeReviewProps } from "./types.js";

/**
 * Displays proposed edits with expandable diffs and review actions.
 *
 * The host owns the proposals, their statuses and the effects of applying,
 * dismissing or undoing them. The panel owns disclosure state and derives the
 * reviewed count from the host's statuses. Action groups inherit the theme layout.
 *
 * @param props Proposals, host callbacks and root section attributes.
 * @returns An initially expanded review panel.
 * @example
 * <ChangeReview
 *   changes={[{ id: "intro", summary: "Clarify the opening", target: { label: "Field notes" },
 *     status: "pending", before: "Head north.", after: "Follow the northern ridge." }]}
 *   onApply={(id) => applyChange(id)}
 *   onDismiss={(id) => dismissChange(id)}
 * />
 */
export function ChangeReview({
  changes,
  onApply,
  onDismiss,
  onUndo,
  className,
  ...rest
}: ChangeReviewProps) {
  const [open, setOpen] = useState(true);
  const reviewClassName = "cu-review";
  const headerClassName = "cu-change-row cu-review-disclosure";
  const countClassName = "cu-meta";
  const reviewed = changes.filter((change) => isReviewed(change.status)).length;
  return (
    <Collapsible asChild open={open} onOpenChange={setOpen}>
      <section aria-label="Change review" {...rest} className={cn(reviewClassName, className)}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className={headerClassName}>
            {open ? <ChevronDown aria-hidden /> : <ChevronRight aria-hidden />}
            <ListChecks aria-hidden />
            Changes
            <small className={countClassName}>
              {reviewed}/{changes.length} reviewed
            </small>
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          {changes.map((change) => (
            <ChangeReviewRow
              key={change.id}
              change={change}
              onApply={onApply}
              onDismiss={onDismiss}
              onUndo={onUndo}
            />
          ))}
        </CollapsibleContent>
      </section>
    </Collapsible>
  );
}
