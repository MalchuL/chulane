/** Internal page browser toolbar and its action controls. */
import {
  ArrowDownAZ,
  ArrowDownUp,
  Calendar,
  Filter,
  Grid2X2,
  List,
  Plus,
  Star,
} from "lucide-react";
import { ActionMenu } from "../../commands/action-menu/action-menu.js";
import { ButtonGroup } from "../../foundation/button-group/button-group.js";
import { IconButton } from "../../foundation/icon-button/icon-button.js";
import { SearchField } from "../../foundation/search-field/search-field.js";
import type { usePageBrowser } from "./hooks.js";
import type { PageBrowserProps } from "./types.js";

/**
 * Render the heading, visible count, search and actions.
 * @param props Heading, browser control state and optional host create callback.
 * @returns The responsive toolbar.
 */
export function PageBrowserToolbar({
  title,
  browser,
  onCreate,
}: Pick<PageBrowserProps, "title" | "onCreate"> & {
  browser: ReturnType<typeof usePageBrowser>;
}) {
  const toolbarClassName = "cu-page-browser-toolbar";
  return (
    <header className={toolbarClassName}>
      <h2>
        {title} <small>{browser.visiblePages.length}</small>
      </h2>
      <SearchField
        label="Search pages"
        placeholder="Search"
        value={browser.query}
        onValueChange={browser.setQuery}
      />
      <PageBrowserActions browser={browser} onCreate={onCreate} />
    </header>
  );
}

/**
 * Render the filter, sort, layout and optional create buttons.
 * @param props Browser control state and the host create callback.
 * @returns The named action group.
 */
function PageBrowserActions({
  browser,
  onCreate,
}: Pick<PageBrowserProps, "onCreate"> & {
  browser: ReturnType<typeof usePageBrowser>;
}) {
  return (
    <ButtonGroup label="Page browser actions">
      <ActionMenu
        label="Filter"
        trigger={
          <IconButton label="Filter pages">
            <Filter />
          </IconButton>
        }
        items={[
          {
            id: "star",
            label: "Favorites only",
            icon: Star,
            checked: browser.favorites,
            onSelect: () => browser.setFavorites((favorites) => !favorites),
          },
        ]}
      />
      <PageSortMenu browser={browser} />
      <IconButton
        label="Grid view"
        aria-pressed={browser.grid}
        onClick={() => browser.setGrid((grid) => !grid)}
      >
        {browser.grid ? <List /> : <Grid2X2 />}
      </IconButton>
      {onCreate && (
        <IconButton label="Create page" onClick={onCreate}>
          <Plus />
        </IconButton>
      )}
    </ButtonGroup>
  );
}

/**
 * Offer the available sort orders and identify the current choice.
 * @param props Browser state supplying sort options and the selected order.
 * @returns The page sorting menu.
 */
function PageSortMenu({ browser }: { browser: ReturnType<typeof usePageBrowser> }) {
  return (
    <ActionMenu
      label="Sort"
      trigger={
        <IconButton label="Sort pages">
          <ArrowDownUp />
        </IconButton>
      }
      items={browser.sortOptions.map((label) => ({
        id: label,
        label,
        icon: label === "Title" ? ArrowDownAZ : Calendar,
        checked: browser.sort === label,
        onSelect: () => browser.setSort(label),
      }))}
    />
  );
}
