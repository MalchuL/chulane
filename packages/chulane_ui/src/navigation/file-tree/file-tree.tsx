/** Host-controlled navigation using the shadcn/ui File Tree composition. */
import { useState, type ReactElement } from "react";
import { ChevronRight, FileText, Folder, MessageCircle, MoreHorizontal } from "lucide-react";
import { ContextMenu } from "../../commands/context-menu/context-menu.js";
import { ActionMenu } from "../../commands/action-menu/action-menu.js";
import { Button } from "../../foundation/button/button.js";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../../components/ui/collapsible.js";
import { IconButton } from "../../foundation/icon-button/icon-button.js";
import type { FileTreeNode, FileTreeProps } from "./types.js";

export type { FileTreeProps } from "./types.js";

const listClass = "cu-tree-list";
const rowClass = "cu-tree-row";
const buttonClass = "cu-tree-button";
const nameClass = "cu-tree-name";
const actionsClass = "cu-tree-actions";

/**
 * Display projects, collections and pages using stable host IDs.
 *
 * The folder row toggles its children. Its action menu also lets the host open
 * the folder itself. Closing a branch preserves its descendants' expansion.
 *
 * @param props - Nodes, selected ID, optional controlled expansion and host callbacks.
 * @returns The nested navigation list.
 */
export function FileTree({
  items,
  selected,
  onSelect,
  actions,
  expandedIds,
  onExpandedChange,
}: FileTreeProps) {
  const [localExpanded, setLocalExpanded] = useState<string[]>([]);
  const expanded = expandedIds ?? localExpanded;

  /**
   * Render one level with the same selection and expansion state as its parent.
   * @param nodes - Siblings in host-defined navigation order.
   * @returns A list of folder disclosures and selectable destinations.
   */
  function renderList(nodes: FileTreeNode[]): ReactElement {
    return (
      <ul className={listClass}>
        {nodes.map((item) => {
          const children = item.children;
          const iconIsFolder =
            children !== undefined || item.kind === "project" || item.kind === "collection";
          let Icon = FileText;
          if (iconIsFolder) {
            Icon = Folder;
          } else if (item.kind === "conversation") {
            Icon = MessageCircle;
          }
          const menu = actions?.(item) ?? [];
          const commands = children
            ? [
                {
                  id: "open-folder",
                  label: "Open " + item.label,
                  icon: Folder,
                  run: () => onSelect(item.id),
                },
                ...menu,
              ]
            : menu;
          const button = (
            <Button
              variant="ghost"
              size="sm"
              className={buttonClass}
              aria-current={selected === item.id ? "true" : undefined}
              onClick={children ? undefined : () => onSelect(item.id)}
            >
              {children && <ChevronRight aria-hidden data-slot="tree-chevron" />}
              <Icon aria-hidden data-slot="tree-icon" />
              <span className={nameClass}>{item.label}</span>
            </Button>
          );
          const row = (
            <div className={rowClass}>
              {children ? <CollapsibleTrigger asChild>{button}</CollapsibleTrigger> : button}
              {commands.length > 0 && (
                <ActionMenu
                  label={item.label + " actions"}
                  items={commands}
                  trigger={
                    <IconButton className={actionsClass} label={item.label + " actions"}>
                      <MoreHorizontal />
                    </IconButton>
                  }
                />
              )}
            </div>
          );
          const interactiveRow = commands.length ? (
            <ContextMenu asChild label={item.label + " actions"} items={commands}>
              {row}
            </ContextMenu>
          ) : (
            row
          );
          if (!children) {
            return <li key={item.id}>{interactiveRow}</li>;
          }
          return (
            <Collapsible
              asChild
              key={item.id}
              open={expanded.includes(item.id)}
              onOpenChange={(open) => {
                const next = open
                  ? [...expanded, item.id]
                  : expanded.filter((id) => id !== item.id);
                if (expandedIds === undefined) {
                  setLocalExpanded(next);
                }
                onExpandedChange?.(next);
              }}
            >
              <li>
                {interactiveRow}
                <CollapsibleContent>{renderList(children)}</CollapsibleContent>
              </li>
            </Collapsible>
          );
        })}
      </ul>
    );
  }
  return renderList(items);
}
