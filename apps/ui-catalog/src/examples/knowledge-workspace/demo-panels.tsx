/** The catalog chooses pixel-constrained resizable panes for its sample workspace. */
import { useRef } from "react";
import type { WorkspacePanes, WorkspaceLayout } from "chulane_ui";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "./resizable";
export function DemoPanels({
  panes,
  layout,
  onLayout,
}: {
  panes: WorkspacePanes;
  layout: WorkspaceLayout;
  onLayout: (value: WorkspaceLayout) => void;
}) {
  const groupElement = useRef<HTMLDivElement>(null);
  const css = getComputedStyle(document.documentElement);
  const token = (name: string) => css.getPropertyValue("--ui-" + name).trim();
  const compact = panes.mode === "compact";
  const prefix = panes.mode === "expanded" ? "expanded" : "nav";
  const panelProps = { className: "catalog-pane-content", style: { overflow: "hidden" } };
  const group = "catalog-resizable";
  return (
    <ResizablePanelGroup
      className={group}
      orientation="horizontal"
      elementRef={groupElement}
      onLayoutChanged={(sizes, meta) => {
        if (!meta.isUserInteraction || !groupElement.current) {
          return;
        }
        // The callback precedes the DOM resize. The total panel width excludes separators and is conserved.
        const panels = groupElement.current.querySelectorAll(":scope > [data-panel]");
        const available = Array.from(panels).reduce(
          (width, panel) => width + panel.getBoundingClientRect().width,
          0,
        );
        onLayout({
          ...layout,
          navWidth:
            compact || sizes.navigation === undefined
              ? layout.navWidth
              : (available * sizes.navigation) / 100,
          agentWidth:
            sizes.agent === undefined ? layout.agentWidth : (available * sizes.agent) / 100,
        });
      }}
    >
      {panes.navigation && (
        <ResizablePanel
          {...panelProps}
          id="navigation"
          groupResizeBehavior="preserve-pixel-size"
          minSize={token(compact ? "rail" : prefix + "-min")}
          maxSize={token(compact ? "rail" : prefix + "-max")}
          defaultSize={compact ? token("rail") : (layout.navWidth ?? token(prefix))}
        >
          {panes.navigation}
        </ResizablePanel>
      )}
      {panes.navigation && !compact && <ResizableHandle aria-label="Navigation width" />}
      <ResizablePanel {...panelProps} id="document">
        {panes.main}
      </ResizablePanel>
      {panes.agent && <ResizableHandle aria-label="Agent width" />}
      {panes.agent && (
        <ResizablePanel
          {...panelProps}
          id="agent"
          groupResizeBehavior="preserve-pixel-size"
          minSize={token("agent-min")}
          maxSize={token("agent-max")}
          defaultSize={layout.agentWidth ?? token("agent")}
        >
          {panes.agent}
        </ResizablePanel>
      )}
    </ResizablePanelGroup>
  );
}
