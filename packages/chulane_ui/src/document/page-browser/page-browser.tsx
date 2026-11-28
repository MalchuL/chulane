/** Composes searchable page results with browser controls and host feedback. */
import { cn } from "cn";
import { ScrollArea } from "../../components/ui/scroll-area.js";
import { Feedback } from "../../foundation/feedback/feedback.js";
import { PageRow } from "../page-row/index.js";
import { usePageBrowser } from "./hooks.js";
import { PageBrowserToolbar } from "./parts.js";
import type { PageBrowserProps } from "./types.js";

/**
 * Browse, search, filter and sort pages in a list or grid.
 *
 * The host owns page data, selection and commands. The browser owns local
 * search, filter, sort and layout state.
 *
 * @param props Page data, callbacks, status and root section attributes.
 * @returns The browser with its toolbar and results.
 * @example
 * <PageBrowser title="All pages" pages={pages} onOpen={openPage} />
 */
export function PageBrowser({
  title,
  pages,
  selected,
  onOpen,
  onCreate,
  getActions,
  status,
  onRetry,
  className,
  ...rest
}: PageBrowserProps) {
  const panelStackClassName = "cu-panel cu-stack";
  const browser = usePageBrowser(pages);
  return (
    <section {...rest} className={cn(panelStackClassName, className)}>
      <PageBrowserToolbar title={title} browser={browser} onCreate={onCreate} />
      <PageBrowserResults
        pages={browser.visiblePages}
        grid={browser.grid}
        selected={selected}
        onOpen={onOpen}
        getActions={getActions}
        status={status}
        onRetry={onRetry}
      />
    </section>
  );
}

/**
 * Show loading or error feedback, an empty message, or the scrollable page rows.
 * @param props Result pages, view mode and host actions.
 * @returns The current results or feedback.
 */
function PageBrowserResults({
  pages,
  grid,
  selected,
  onOpen,
  getActions,
  status,
  onRetry,
}: Pick<PageBrowserProps, "pages" | "selected" | "onOpen" | "getActions" | "status" | "onRetry"> & {
  grid: boolean;
}) {
  const pageListClassName = "cu-page-list";
  if (status) {
    return (
      <Feedback
        state={status}
        message={status === "loading" ? "Loading pages…" : "Could not load pages"}
        onRetry={onRetry}
      />
    );
  }
  if (!pages.length) {
    return <Feedback state="empty" message="No matching pages" />;
  }
  return (
    <ScrollArea>
      <div className={pageListClassName} data-grid={grid}>
        {pages.map((page) => (
          <PageRow
            key={page.id}
            page={page}
            selected={selected === page.id}
            onOpen={onOpen}
            actions={getActions?.(page)}
          />
        ))}
      </div>
    </ScrollArea>
  );
}
