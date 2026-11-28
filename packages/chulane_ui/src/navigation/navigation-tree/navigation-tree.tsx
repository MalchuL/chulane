/** Adapts the shared file tree view to the workspace navigation vocabulary. */
import { FileTree } from "../file-tree/index.js";
import type { NavigationTreeProps } from "./types.js";

/**
 * Browse nested pages, collections, projects and conversations.
 *
 * The host owns the items, selected destination and actions. The tree manages
 * branch disclosure locally or reports it to a controlling host.
 *
 * @example
 * <NavigationTree items={[{ id: "journal", label: "Journal" }]} onSelectedChange={openPage} />
 * @param props Root list attributes, items, selection and disclosure controls.
 * @returns The nested navigation list.
 */
export function NavigationTree(props: NavigationTreeProps) {
  return <FileTree {...props} />;
}
