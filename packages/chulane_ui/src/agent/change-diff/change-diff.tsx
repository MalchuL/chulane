/** Keeps the original and proposed text available without expanding every change. */
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "../../components/ui/collapsible.js";

import { ChevronDown } from "lucide-react";
import type { ChangeDiffProps } from "./types.js";
/**
 * Review the original and proposed passages before applying a change.
 * @param props Presentation values and host callbacks described by the public props type.
 * @returns The rendered ChangeDiff view.
 */
export function ChangeDiff({ compact, before, after, label = "View diff" }: ChangeDiffProps) {
  const deleteClassName = "cu-delete";
  const addClassName = "cu-add";
  return (
    <Collapsible data-compact={compact || undefined}>
      <CollapsibleTrigger aria-label={label} title={label}>
        {compact ? <ChevronDown /> : label}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <pre className={deleteClassName}>− {before}</pre>
        <pre className={addClassName}>+ {after}</pre>
      </CollapsibleContent>
    </Collapsible>
  );
}
