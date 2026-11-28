/** Private tree rows and recursive disclosures that share selection and expansion. */
import { ChevronRight, FileText, Folder, MessageCircle, MoreHorizontal } from "lucide-react";
import { ActionMenu } from "../../commands/action-menu/action-menu.js";
import { ContextMenu } from "../../commands/context-menu/context-menu.js";
import type { MenuEntry } from "../../commands/types.js";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../../components/ui/collapsible.js";
import { Button } from "../../foundation/button/button.js";
import { IconButton } from "../../foundation/icon-button/icon-button.js";
import type { NavigationItem } from "../navigation-tree/types.js";
import type { useTreeExpansion } from "./hooks.js";
import type { FileTreeProps } from "./types.js";

type TreeState = Pick<FileTreeProps, "selected" | "onSelectedChange" | "actions"> &
  ReturnType<typeof useTreeExpansion>;

type TreeBranchProps = { item: NavigationItem; tree: TreeState };

/**
 * Render the icon that represents a destination or disclosure.
 * @param props The host destination.
 * @returns The icon for the item.
 */
function TreeItemIcon({ item }: { item: NavigationItem }) {
  if (item.children || item.kind === "project" || item.kind === "collection") {
    return <Folder aria-hidden data-slot="tree-icon" />;
  }
  if (item.kind === "conversation") {
    return <MessageCircle aria-hidden data-slot="tree-icon" />;
  }
  return <FileText aria-hidden data-slot="tree-icon" />;
}

/**
 * Render a selectable leaf or a folder whose child rows share the root state.
 * @param props The destination and shared selection and disclosure controls.
 * @returns A list item, wired to a disclosure when it has children.
 */
export function TreeBranch({ item, tree }: TreeBranchProps) {
  const listClassName = "cu-tree-list";
  const row = <TreeRow item={item} tree={tree} />;
  if (!item.children) {
    return <li>{row}</li>;
  }

  return (
    <Collapsible
      asChild
      open={tree.expandedIds.includes(item.id)}
      onOpenChange={(open) => tree.setBranchOpen(item.id, open)}
    >
      <li>
        {row}
        <CollapsibleContent>
          <ul className={listClassName}>
            {item.children.map((child) => (
              <TreeBranch key={child.id} item={child} tree={tree} />
            ))}
          </ul>
        </CollapsibleContent>
      </li>
    </Collapsible>
  );
}

/**
 * Render the row trigger and share its actions between the button and context menu.
 * @param props The destination and shared tree state.
 * @returns The row and its context menu when actions are available.
 */
function TreeRow({ item, tree }: TreeBranchProps) {
  const rowClassName = "cu-tree-row";
  const buttonClassName = "cu-tree-button";
  const nameClassName = "cu-tree-name";
  const smallIconClassName = "cu-icon-sm";
  const menuLabel = item.label + " actions";
  const commands: MenuEntry[] = [...(tree.actions?.(item) ?? [])];
  if (item.children) {
    commands.unshift({
      id: "open-folder",
      label: "Open " + item.label,
      icon: Folder,
      onSelect: () => tree.onSelectedChange(item.id),
    });
  }
  const button = (
    <Button
      variant="ghost"
      size="sm"
      className={buttonClassName}
      aria-current={tree.selected === item.id ? "true" : undefined}
      onClick={item.children ? undefined : () => tree.onSelectedChange(item.id)}
    >
      {item.children && (
        <ChevronRight className={smallIconClassName} aria-hidden data-slot="tree-chevron" />
      )}
      <TreeItemIcon item={item} />
      <span className={nameClassName}>{item.label}</span>
    </Button>
  );
  const row = (
    <div className={rowClassName}>
      {item.children ? <CollapsibleTrigger asChild>{button}</CollapsibleTrigger> : button}
      {commands.length > 0 && <TreeActions label={menuLabel} commands={commands} />}
    </div>
  );
  return commands.length > 0 ? (
    <ContextMenu asChild label={menuLabel} items={commands}>
      {row}
    </ContextMenu>
  ) : (
    row
  );
}

/**
 * Provide a keyboard-accessible trigger for an item's commands.
 * @param props The accessible name and available commands.
 * @returns The action menu trigger for the row.
 */
function TreeActions({ label, commands }: { label: string; commands: MenuEntry[] }) {
  const actionsClassName = "cu-tree-actions";
  return (
    <ActionMenu
      label={label}
      items={commands}
      trigger={
        <IconButton size="icon-xs" className={actionsClassName} label={label}>
          <MoreHorizontal />
        </IconButton>
      }
    />
  );
}
