/** Live DocumentTabs usage, also displayed as source in the catalog. */
import { useState } from "react";
import { DocumentTabs } from "chulane_ui";

export default function Example() {
  const [tabs, setTabs] = useState([
    { id: "a", title: "Field notes" },
    { id: "b", title: "Research atlas" },
  ]);
  const [active, setActive] = useState("a");
  return (
    <DocumentTabs
      tabs={tabs}
      active={active}
      onSelect={setActive}
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
