/** The catalog chooses pixel-constrained resizable panes for its sample workspace. */
import { useRef } from "react";
import type { ComponentProps, ReactNode } from "react";
import type { WorkspacePanels } from "@chulane/ui";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "./resizable";

/** Layout preferences persisted by the catalog workspace demo. */
export type DemoWorkspaceLayout = {
  /** Whether workspace navigation is open. */
  navigation: boolean;
  /** Whether the agent is docked. */
  agent: boolean;
  /** Whether focus mode is active. */
  focus: boolean;
  /** Whether the secondary document is displayed. */
  split: boolean;
  /** Saved sidebar width in CSS pixels, or the sidebar token when absent. */
  navWidth?: number;
  /** Saved agent width in CSS pixels, or the agent token when absent. */
  agentWidth?: number;
};

/** State and rendered slots borrowed from the workspace demo. */
type DemoPanelsProps = {
  panels: WorkspacePanels;
  layout: DemoWorkspaceLayout;
  onLayoutChange: (layout: DemoWorkspaceLayout) => void;
};

const panelClassName = "catalog-pane-content";
const panelProps = { className: panelClassName, style: { overflow: "hidden" } };

/**
 * Read a width token for the resizer from the catalog's root.
 * @param name Token name without the shared --ui- prefix.
 * @returns The CSS size accepted by the resizer.
 */
function readWidthToken(name: string) {
  return getComputedStyle(document.documentElement)
    .getPropertyValue("--ui-" + name)
    .trim();
}

/**
 * Convert panel percentages to pixels using the group before resize.
 * @param group Mounted resizer group.
 * @param sizes Updated panel sizes as percentages of the combined width.
 * @param layout Current host preferences.
 * @param compact Whether the sidebar is showing at its fixed rail width.
 * @returns Updated preferences for the visible docked panels.
 */
function resizedLayout(
  group: HTMLDivElement,
  sizes: Record<string, number>,
  layout: DemoWorkspaceLayout,
  compact: boolean,
) {
  // The callback precedes the DOM resize. The combined panel width excludes separators and is conserved.
  const panels = group.querySelectorAll(":scope > [data-panel]");
  const available = Array.from(panels).reduce(
    (width, panel) => width + panel.getBoundingClientRect().width,
    0,
  );
  return {
    ...layout,
    navWidth:
      compact || sizes.navigation === undefined
        ? layout.navWidth
        : (available * sizes.navigation) / 100,
    agentWidth: sizes.agent === undefined ? layout.agentWidth : (available * sizes.agent) / 100,
  };
}

/**
 * Render the catalog sidebar with width bounds for the current sidebar mode.
 * @param props Sidebar content, current mode and saved desktop width in CSS pixels.
 * @returns The sidebar panel and its optional resize separator.
 */
function DemoSidebarPanel({
  mode,
  width,
  children,
}: {
  mode: WorkspacePanels["sidebarMode"];
  width?: number;
  children: ReactNode;
}) {
  const compact = mode === "compact";
  const prefix = mode === "expanded" ? "expanded" : "nav";
  const rail = readWidthToken("rail");
  return (
    <>
      <ResizablePanel
        {...panelProps}
        id="navigation"
        groupResizeBehavior="preserve-pixel-size"
        minSize={compact ? rail : readWidthToken(prefix + "-min")}
        maxSize={compact ? rail : readWidthToken(prefix + "-max")}
        defaultSize={compact ? rail : (width ?? readWidthToken(prefix))}
      >
        {children}
      </ResizablePanel>
      {!compact && <ResizableHandle aria-label="Navigation width" />}
    </>
  );
}

/**
 * Render shell pane slots in a resizable group and persist user-driven widths.
 * @param props Rendered shell panes, current preferences and their save callback.
 * @returns The catalog's resizable workspace panes.
 */
export function DemoPanels({ panels, layout, onLayoutChange }: DemoPanelsProps) {
  const groupElement = useRef<HTMLDivElement>(null);
  const groupClassName = "catalog-resizable";

  /** Save converted widths when the catalog resizer reports a user action. */
  const saveWidths: ComponentProps<typeof ResizablePanelGroup>["onLayoutChanged"] = (
    sizes,
    meta,
  ) => {
    const group = groupElement.current;
    if (meta.isUserInteraction && group) {
      onLayoutChange(resizedLayout(group, sizes, layout, panels.sidebarMode === "compact"));
    }
  };

  return (
    <ResizablePanelGroup
      className={groupClassName}
      orientation="horizontal"
      elementRef={groupElement}
      onLayoutChanged={saveWidths}
    >
      {panels.sidebar && (
        <DemoSidebarPanel mode={panels.sidebarMode} width={layout.navWidth}>
          {panels.sidebar}
        </DemoSidebarPanel>
      )}
      <ResizablePanel {...panelProps} id="document">
        {panels.main}
      </ResizablePanel>
      {panels.agent && <ResizableHandle aria-label="Agent width" />}
      {panels.agent && (
        <ResizablePanel
          {...panelProps}
          id="agent"
          groupResizeBehavior="preserve-pixel-size"
          minSize={readWidthToken("agent-min")}
          maxSize={readWidthToken("agent-max")}
          defaultSize={layout.agentWidth ?? readWidthToken("agent")}
        >
          {panels.agent}
        </ResizablePanel>
      )}
    </ResizablePanelGroup>
  );
}
