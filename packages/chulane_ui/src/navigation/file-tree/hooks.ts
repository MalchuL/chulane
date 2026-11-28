/** Manages branch disclosure while leaving controlled expansion with the host. */
import { useState } from "react";
import type { FileTreeProps } from "./types.js";

type ExpansionProps = Pick<FileTreeProps, "expanded" | "defaultExpanded" | "onExpandedChange">;

/**
 * Resolve expanded IDs and preserve descendant disclosure when a parent closes.
 * @param props Controlled IDs, initial local IDs and the optional change callback.
 * @returns The current expanded IDs and the operation that updates a branch.
 */
export function useTreeExpansion({
  expanded,
  defaultExpanded = [],
  onExpandedChange,
}: ExpansionProps) {
  const [localExpanded, setLocalExpanded] = useState(defaultExpanded);
  const expandedIds = expanded ?? localExpanded;

  /**
   * Change one branch's disclosure.
   * @param id Branch ID.
   * @param open Whether the branch should be open.
   */
  function setBranchOpen(id: string, open: boolean) {
    const next = open ? [...expandedIds, id] : expandedIds.filter((itemId) => itemId !== id);
    if (expanded === undefined) {
      setLocalExpanded(next);
    }
    onExpandedChange?.(next);
  }

  return { expandedIds, setBranchOpen };
}
