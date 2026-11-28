/** page browser presentation and interaction contract. */
import { ButtonGroup } from "../../foundation/button-group/button-group.js";
import { ScrollArea } from "../../components/ui/scroll-area.js";

import type { PageBrowserProps } from "./types.js";
import { useState } from "react";
import {
  List,
  Grid2X2,
  Plus,
  Filter,
  ArrowDownUp,
  Star,
  Calendar,
  ArrowDownAZ,
} from "lucide-react";
import { PageRow } from "../page-row/page-row.js";
import { IconButton } from "../../foundation/icon-button/icon-button.js";
import { Feedback } from "../../foundation/feedback/feedback.js";
import { SearchField } from "../../foundation/search-field/search-field.js";
import { ActionMenu } from "../../commands/action-menu/action-menu.js";

export type { PageBrowserProps } from "./types.js";
/**
 * Browse, search, filter and sort pages with list or grid presentation.
 * @param props Presentation values and host callbacks described by the public props type.
 * @returns The rendered PageBrowser view.
 */
export function PageBrowser({
  title,
  pages,
  selected,
  onOpen,
  onCreate,
  actions,
  status,
  onRetry,
}: PageBrowserProps) {
  const panelStackClassName = "cu-panel cu-stack";
  const toolbarClassName = "cu-toolbar";
  const spacerClassName = "cu-spacer";
  const pageListClassName = "cu-page-list";
  const [query, setQuery] = useState("");
  const [favorites, setFavorites] = useState(false);
  const [sort, setSort] = useState("Recently edited");
  const [grid, setGrid] = useState(false);
  const visible = pages
    .filter(
      (p) =>
        (!favorites || p.favorite) &&
        (p.title + " " + (p.preview ?? "")).toLowerCase().includes(query.toLowerCase()),
    )
    .sort((a, b) =>
      sort === "Title" ? a.title.localeCompare(b.title) : b.date.localeCompare(a.date),
    );
  let results;
  if (status) {
    results = (
      <Feedback
        state={status}
        message={status === "loading" ? "Loading pages…" : "Could not load pages"}
        onRetry={onRetry}
      />
    );
  } else {
    if (visible.length) {
      results = (
        <ScrollArea>
          <div className={pageListClassName} data-grid={grid}>
            {visible.map((p) => (
              <PageRow
                key={p.id}
                page={p}
                selected={selected === p.id}
                onOpen={() => onOpen(p.id)}
                actions={actions?.(p)}
              />
            ))}
          </div>
        </ScrollArea>
      );
    } else {
      results = <Feedback state="empty" message="No matching pages" />;
    }
  }
  return (
    <section className={panelStackClassName}>
      <header className={toolbarClassName}>
        <h2>
          {title} <small>{visible.length}</small>
        </h2>
        <span className={spacerClassName} />
        <SearchField
          label="Search pages"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
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
                checked: favorites,
                run: () => setFavorites(!favorites),
              },
            ]}
          />
          <ActionMenu
            label="Sort"
            trigger={
              <IconButton label="Sort pages">
                <ArrowDownUp />
              </IconButton>
            }
            items={["Title", "Recently edited"].map((label) => ({
              id: label,
              label,
              icon: label === "Title" ? ArrowDownAZ : Calendar,
              checked: sort === label,
              run: () => setSort(label),
            }))}
          />
          <IconButton label="Grid view" aria-pressed={grid} onClick={() => setGrid(!grid)}>
            {grid ? <List /> : <Grid2X2 />}
          </IconButton>
          {onCreate && (
            <IconButton label="Create page" onClick={onCreate}>
              <Plus />
            </IconButton>
          )}
        </ButtonGroup>
      </header>
      {results}
    </section>
  );
}
