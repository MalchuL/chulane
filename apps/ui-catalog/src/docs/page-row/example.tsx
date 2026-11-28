/** Live PageRow usage, also displayed as source in the catalog. */
import { useState } from "react";
import { PageRow } from "@chulane/ui";
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
 * Show image, emoji and default previews with a locally controlled selection.
 * @returns The standalone page row examples.
 */
export default function Example() {
  const [selected, setSelected] = useState("");
  return (
    <div>
      {pages.map((page) => (
        <PageRow
          key={page.id}
          page={page}
          selected={selected === page.id}
          onOpen={(id) => setSelected(selected === id ? "" : id)}
        />
      ))}
    </div>
  );
}
