/** Live Sidebar usage, also displayed as source in the catalog. */
import { useState } from "react";
import { Sidebar, createDefaultSidebarPreferences } from "@chulane/ui";
const sections = [
  { id: "favorites", label: "Favorites", items: [{ id: "field", label: "Field notes" }] },
  {
    id: "recent",
    label: "Recent pages",
    items: [{ id: "atlas", label: "Research atlas" }],
  },
];

export default function Example() {
  const sidebarPreviewClassName = "catalog-sidebar-preview";
  const [prefs, setPrefs] = useState(createDefaultSidebarPreferences(sections));
  const [selected, setSelected] = useState("");
  return (
    <div className={sidebarPreviewClassName}>
      <Sidebar
        header={<strong>Personal</strong>}
        footer={<small>Local workspace</small>}
        sections={sections}
        preferences={prefs}
        onPreferencesChange={setPrefs}
        selected={selected}
        onSelectedChange={setSelected}
      />
    </div>
  );
}
