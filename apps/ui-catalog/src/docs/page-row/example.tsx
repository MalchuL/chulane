/** Live PageRow usage, also displayed as source in the catalog. */
import { useState } from "react";
import { PageRow } from "chulane_ui";
const pages = [
  {
    id: "field",
    title: "Field notes",
    preview: "Observations from the northern trail.",
    date: "2026-11-24",
    collection: "Research",
    favorite: true,
  },
  {
    id: "atlas",
    title: "Research atlas",
    preview: "A working map of places and ideas.",
    date: "2026-11-23",
    collection: "Research",
  },
];

export default function Example() {
  const [selected, setSelected] = useState(false);
  return <PageRow page={pages[0]} selected={selected} onOpen={() => setSelected(!selected)} />;
}
