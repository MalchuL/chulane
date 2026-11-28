/** page row presentation and interaction contract. */
import { Button } from "../../foundation/button/button.js";
import { ContextMenu } from "../../commands/context-menu/context-menu.js";
import { Item } from "../../components/ui/item.js";

import type { PageRowProps } from "./types.js";
import { MoreHorizontal } from "lucide-react";
import { ActionMenu } from "../../commands/action-menu/action-menu.js";
import { IconButton } from "../../foundation/icon-button/icon-button.js";

export type { PageSummary, PageRowProps } from "./types.js";

/**
 * Display a title, readable preview, date and optional page actions.
 * @param props Presentation values and host callbacks described by the public props type.
 * @returns The rendered PageRow view.
 */
export function PageRow({ page, selected, onOpen, actions }: PageRowProps) {
  const pageRowClassName = "cu-page-row";
  const pageOpenClassName = "cu-page-open";
  const mutedClassName = "cu-muted";
  const metaClassName = "cu-meta";
  const row = (
    <Item className={pageRowClassName} data-selected={selected}>
      <Button
        variant="ghost"
        className={pageOpenClassName}
        type="button"
        aria-pressed={!!selected}
        onClick={onOpen}
      >
        <strong>{page.title}</strong>
        {page.preview && <span className={mutedClassName}>{page.preview}</span>}
      </Button>
      <time className={metaClassName}>{page.date}</time>
      {actions?.length ? (
        <ActionMenu
          label="Page actions"
          items={actions}
          trigger={
            <IconButton label={"Actions for " + page.title}>
              <MoreHorizontal />
            </IconButton>
          }
        />
      ) : null}
    </Item>
  );
  return actions?.length ? (
    <ContextMenu asChild label={page.title + " actions"} items={actions}>
      {row}
    </ContextMenu>
  ) : (
    row
  );
}
