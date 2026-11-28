/** Live Sidebar usage, also displayed as source in the catalog. */
import { useState } from "react";
import { Sidebar, defaultSidebar } from "chulane_ui";
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
  const [prefs, setPrefs] = useState(defaultSidebar(sections));
  const [selected, setSelected] = useState("");
  return (
    <div className={sidebarPreviewClassName}>
      <Sidebar
        header={<strong>Personal</strong>}
        footer={<small>Local workspace</small>}
        sections={sections}
        preferences={prefs}
        onPreferences={setPrefs}
        selected={selected}
        onSelect={setSelected}
      />
    </div>
  );
}
