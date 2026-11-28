/** Renders nested file navigation, with disclosure state shared across all levels. */
import { cn } from "cn";
import { useTreeExpansion } from "./hooks.js";
import { TreeBranch } from "./parts.js";
import type { FileTreeProps } from "./types.js";

/**
 * Displays host destinations as a nested list of selectable files and expandable folders.
 *
 * The host owns items, selection and optional actions. The tree owns local
 * disclosure unless the host supplies expanded IDs. Closing a branch preserves
 * the disclosure of its descendants, and its menu can open the folder itself.
 *
 * @example
 * <FileTree items={[{ id: "notes", label: "Notes" }]} onSelectedChange={openPage} />
 * @param props Items, root list attributes, selection, actions and optional expansion controls.
 * @returns The nested navigation list.
 */
export function FileTree({
  items,
  selected,
  onSelectedChange,
  actions,
  expanded,
  defaultExpanded,
  onExpandedChange,
  className,
  ...rest
}: FileTreeProps) {
  const listClassName = "cu-tree-list";
  const expansion = useTreeExpansion({ expanded, defaultExpanded, onExpandedChange });
  const tree = { selected, onSelectedChange, actions, ...expansion };

  return (
    <ul {...rest} className={cn(listClassName, className)}>
      {items.map((item) => (
        <TreeBranch key={item.id} item={item} tree={tree} />
      ))}
    </ul>
  );
}
