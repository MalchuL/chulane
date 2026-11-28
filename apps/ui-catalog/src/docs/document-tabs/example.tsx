/** Live DocumentTabs usage, also displayed as source in the catalog. */
import { useState } from "react";
import { DocumentTabs } from "@chulane/ui";

/**
 * Demonstrate host-owned active selection, tab closure and reordering.
 * @returns The interactive document tab strip.
 */
export default function Example() {
  const [tabs, setTabs] = useState([
    { id: "a", title: "Field notes" },
    { id: "b", title: "Research atlas" },
  ]);
  const [active, setActive] = useState("a");
  return (
    <DocumentTabs
      tabs={tabs}
      value={active}
      onValueChange={setActive}
      onClose={(id) => {
        const next = tabs.filter((t) => t.id !== id);
        setTabs(next);
        if (id === active) {
          setActive(next[0]?.id ?? "");
        }
      }}
      onMove={() => setTabs([...tabs].reverse())}
    />
  );
}
