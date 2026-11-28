/** Renders a page summary and host-owned actions in list and grid layouts. */
import { cn } from "cn";
import { FileText, MoreHorizontal } from "lucide-react";
import { ActionMenu } from "../../commands/action-menu/action-menu.js";
import { ContextMenu } from "../../commands/context-menu/context-menu.js";
import { Item } from "../../components/ui/item.js";
import { Button } from "../../foundation/button/button.js";
import { IconButton } from "../../foundation/icon-button/icon-button.js";
import type { PageRowProps, PageSummary } from "./types.js";

/**
 * Show a page summary with independent open and action controls.
 *
 * The host supplies the page, selection and commands. The row exposes the same
 * menu entries through a button and a context menu.
 *
 * @param props Page metadata, selection, callbacks and root div attributes.
 * @returns The page row and its optional context menu.
 * @example
 * <PageRow page={page} onOpen={openPage} />
 */
export function PageRow({
  page,
  selected = false,
  onOpen,
  actions,
  className,
  ...rest
}: PageRowProps) {
  const pageRowClassName = "cu-page-row";
  const pageOpenClassName = "cu-page-open";
  const summaryClassName = "cu-page-summary";
  const mutedClassName = "cu-muted";
  const row = (
    <Item {...rest} className={cn(pageRowClassName, className)} data-selected={selected}>
      <Button
        variant="ghost"
        className={pageOpenClassName}
        type="button"
        aria-pressed={selected}
        onClick={() => onOpen(page.id)}
      >
        <PageThumbnail thumbnail={page.thumbnail} />
        <span className={summaryClassName}>
          <strong>{page.title}</strong>
          {page.description && <span className={mutedClassName}>{page.description}</span>}
        </span>
      </Button>
      <PageRowMetadata page={page} actions={actions} />
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

/**
 * Keep the date and action button together when the row wraps.
 * @param props The page date, title and optional menu entries.
 * @returns The metadata and its optional action menu.
 */
function PageRowMetadata({ page, actions }: Pick<PageRowProps, "page" | "actions">) {
  const metadataClassName = "cu-page-row-metadata";
  const dateClassName = "cu-meta";
  return (
    <div className={metadataClassName}>
      <time className={dateClassName}>{page.date}</time>
      {!!actions?.length && (
        <ActionMenu
          label="Page actions"
          items={actions}
          trigger={
            <IconButton label={"Actions for " + page.title}>
              <MoreHorizontal />
            </IconButton>
          }
        />
      )}
    </div>
  );
}

/**
 * Render a decorative cover, icon, emoji or default document icon.
 * @param props The optional thumbnail metadata.
 * @returns The decorative thumbnail slot.
 */
function PageThumbnail({ thumbnail }: Pick<PageSummary, "thumbnail">) {
  const previewClassName = "cu-page-preview";
  const Icon = thumbnail?.icon;
  let content = thumbnail?.emoji ?? <FileText />;
  if (thumbnail?.src) {
    content = <img src={thumbnail.src} alt="" />;
  } else if (Icon) {
    content = <Icon />;
  }
  return (
    <span className={previewClassName} aria-hidden="true">
      {content}
    </span>
  );
}
