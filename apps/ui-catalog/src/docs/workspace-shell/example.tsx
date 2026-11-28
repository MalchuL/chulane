/** Live WorkspaceShell usage, also displayed as source in the catalog. */
import { useState } from "react";
import { DocumentSurface, WorkspaceShell } from "@chulane/ui";

/**
 * Demonstrate host-owned panel visibility and a secondary document.
 * @returns The interactive workspace shell example.
 */
export default function Example() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [agentOpen, setAgentOpen] = useState(true);
  const [focusMode, setFocusMode] = useState(false);
  const [splitView, setSplitView] = useState(false);
  return (
    <WorkspaceShell
      sidebarMode="standard"
      sidebarOpen={sidebarOpen}
      onSidebarOpenChange={setSidebarOpen}
      agentOpen={agentOpen}
      onAgentOpenChange={setAgentOpen}
      focusMode={focusMode}
      onFocusModeChange={setFocusMode}
      splitView={splitView}
      onSplitViewChange={setSplitView}
      toolbar={<strong>Research atlas</strong>}
      sidebar={(compact) => <p>{compact ? "AT" : "Atlas navigation"}</p>}
      main={<DocumentSurface heading="Field notes">A quiet place to write.</DocumentSurface>}
      agent={<p>Workspace agent</p>}
      secondaryMain={<p>Second document</p>}
    />
  );
}
