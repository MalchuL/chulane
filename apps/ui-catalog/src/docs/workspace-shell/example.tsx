/** Live WorkspaceShell usage, also displayed as source in the catalog. */
import { useState } from "react";
import { WorkspaceShell, DocumentSurface, initialLayout } from "chulane_ui";

export default function Example() {
  const [layout, setLayout] = useState(initialLayout);
  return (
    <WorkspaceShell
      mode="standard"
      layout={layout}
      onLayout={setLayout}
      toolbar={<strong>Research atlas</strong>}
      navigation={(compact) => <p>{compact ? "AT" : "Atlas navigation"}</p>}
      agent={<p>Workspace agent</p>}
      secondary={<p>Second document</p>}
    >
      <DocumentSurface title="Field notes">A quiet place to write.</DocumentSurface>
    </WorkspaceShell>
  );
}
