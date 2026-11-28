/** Live PageBrowser usage, also displayed as source in the catalog. */
import { useState } from "react";
import { PageBrowser } from "@chulane/ui";
const pages = [
  {
    id: "field",
    title: "Field notes",
    description: "Observations from the northern trail.",
    thumbnail: { src: "/field-study.svg" },
    date: "2026-11-24",
    collection: "Research",
    favorite: true,
  },
  {
    id: "atlas",
    title: "Research atlas",
    description: "A working map of places and ideas.",
    thumbnail: { emoji: "🧭" },
    date: "2026-11-23",
    collection: "Research",
  },
  {
    id: "journal",
    title: "November journal",
    description: "Mist gathered along the ridgeline.",
    date: "2026-11-22",
    collection: "Journal",
  },
];

/**
 * Show the same previews in the browser's toggleable list and grid.
 * @returns The page browser example with local selection.
 */
export default function Example() {
  const [selected, setSelected] = useState("");
  return <PageBrowser title="All pages" pages={pages} selected={selected} onOpen={setSelected} />;
}
