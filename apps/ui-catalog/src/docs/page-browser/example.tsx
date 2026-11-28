/** Live PageBrowser usage, also displayed as source in the catalog. */
import { useState } from "react";
import { PageBrowser } from "chulane_ui";
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
  const [selected, setSelected] = useState("");
  return <PageBrowser title="All pages" pages={pages} selected={selected} onOpen={setSelected} />;
}
