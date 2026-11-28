/** Keeps the original and proposed text available without expanding every change. */
import { cn } from "cn";
import { ChevronDown } from "lucide-react";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "../../components/ui/collapsible.js";
import { Button } from "../../foundation/button/button.js";
import type { ChangeDiffProps } from "./types.js";

/**
 * Displays original and proposed passages in an expandable comparison.
 *
 * The host supplies both versions of the text. The component owns disclosure
 * state and starts collapsed. In compact mode the trigger shows only a chevron.
 *
 * @param props Text to compare, trigger options and root div attributes.
 * @returns A collapsed disclosure with the removed and added passages.
 * @example
 * <ChangeDiff before="Head north." after="Follow the northern ridge." />
 */
export function ChangeDiff({
  before,
  after,
  label = "View diff",
  compact = false,
  className,
  ...rest
}: ChangeDiffProps) {
  const deleteClassName = "cu-delete";
  const addClassName = "cu-add";
  const diffClassName = "cu-diff";
  return (
    <Collapsible
      {...rest}
      className={cn(diffClassName, className)}
      data-compact={compact || undefined}
    >
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm" aria-label={label} title={compact ? label : undefined}>
          {!compact && label}
          <ChevronDown aria-hidden />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <pre className={deleteClassName}>− {before}</pre>
        <pre className={addClassName}>+ {after}</pre>
      </CollapsibleContent>
    </Collapsible>
  );
}
