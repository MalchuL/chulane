/** Owns the local search, filter, sort and layout state of a page browser. */
import { useState } from "react";
import type { PageSummary } from "../page-row/index.js";

const sortOptions = ["Title", "Recently edited"] as const;

/**
 * Keep the browser controls in sync with results derived from the current pages.
 * @param pages The host-owned collection, which is never mutated.
 * @returns Control state, setters and visible pages in display order.
 */
export function usePageBrowser(pages: readonly PageSummary[]) {
  const [query, setQuery] = useState("");
  const [favorites, setFavorites] = useState(false);
  const [sort, setSort] = useState<(typeof sortOptions)[number]>("Recently edited");
  const [grid, setGrid] = useState(false);
  const search = query.toLowerCase();
  const visiblePages = pages
    .filter(
      (page) =>
        (!favorites || page.favorite) &&
        (page.title + " " + (page.description ?? "")).toLowerCase().includes(search),
    )
    .sort((left, right) =>
      sort === "Title"
        ? left.title.localeCompare(right.title)
        : right.date.localeCompare(left.date),
    );
  return {
    query,
    setQuery,
    favorites,
    setFavorites,
    sort,
    sortOptions,
    setSort,
    grid,
    setGrid,
    visiblePages,
  };
}
