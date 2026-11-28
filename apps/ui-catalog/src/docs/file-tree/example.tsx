/** Live FileTree usage, also displayed as source in the catalog. */
import { useState } from "react";
import { FileTree } from "@chulane/ui";

export default function Example() {
  const [selected, setSelected] = useState("");
  const [expanded, setExpanded] = useState(["atlas", "research"]);
  const previewClass = "catalog-file-tree-preview";
  return (
    <div className={previewClass}>
      <FileTree
        expanded={expanded}
        onExpandedChange={setExpanded}
        selected={selected}
        items={[
          {
            id: "atlas",
            label: "Research atlas",
            kind: "project",
            children: [
              {
                id: "research",
                label: "Research",
                kind: "collection",
                children: [{ id: "field", label: "Field notes" }],
              },
            ],
          },
          { id: "overview", label: "Workspace overview", kind: "page" },
        ]}
        onSelectedChange={setSelected}
      />
    </div>
  );
}
