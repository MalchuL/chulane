/** shell presentation and interaction contract. */
import { ButtonGroup } from "../../foundation/button-group/button-group.js";
import { ScrollArea } from "../../components/ui/scroll-area.js";

import type { WorkspaceLayout, WorkspaceShellProps } from "./types.js";
import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { PanelLeft, PanelRight, Maximize, Columns2 } from "lucide-react";
import { IconButton } from "../../foundation/icon-button/icon-button.js";
import { Dialog } from "../../foundation/dialog/dialog.js";

export type { WorkspaceLayout, WorkspaceShellProps, WorkspacePanes } from "./types.js";

export const initialLayout: WorkspaceLayout = {
  navigation: true,
  agent: true,
  focus: false,
  split: false,
};

/**
 * Compose navigation, document and agent panes with independent resize and collapse.
 * @param props Presentation values and host callbacks described by the public props type.
 * @returns The rendered WorkspaceShell view.
 */
export function WorkspaceShell({
  layout: l,
  onLayout,
  mode,
  renderPanels,
  toolbar,
  navigation,
  agent,
  children,
  secondary,
}: WorkspaceShellProps) {
  const shellSurfaceClassName = "cu-shell cu-surface";
  const breakpointProbeClassName = "cu-breakpoint-probe";
  const shellHeaderClassName = "cu-shell-header";
  const spacerClassName = "cu-spacer";
  const shellBodyClassName = "cu-shell-body";
  const shellNavClassName = "cu-shell-nav";
  const shellMainClassName = "cu-shell-main";
  const splitClassName = "cu-split";
  const shellAgentClassName = "cu-shell-agent";
  const host = useRef<HTMLDivElement>(null);
  const probe = useRef<HTMLSpanElement>(null);
  const [compact, setCompact] = useState(false);
  const [overlay, setOverlay] = useState(false);
  useEffect(() => {
    if (!host.current || !probe.current) {
      return;
    }
    const observer = new ResizeObserver(() =>
      setCompact(host.current!.offsetWidth <= probe.current!.offsetWidth),
    );
    observer.observe(host.current);
    observer.observe(probe.current);
    return () => observer.disconnect();
  }, []);
  const agentContent =
    typeof agent === "function"
      ? agent(() => {
          if (compact) {
            setOverlay(false);
          } else {
            onLayout({ ...l, agent: false });
          }
        })
      : agent;
  const navMode = compact ? "compact" : mode;
  const style = {
    "--ui-user-nav": l.navWidth === undefined ? undefined : l.navWidth + "px",
    "--ui-user-agent": l.agentWidth === undefined ? undefined : l.agentWidth + "px",
  } as CSSProperties;
  const panes = {
    mode: navMode,
    navigation:
      l.navigation && !l.focus ? (
        <aside data-mode={navMode} className={shellNavClassName}>
          {navigation(compact)}
        </aside>
      ) : null,
    main: (
      <div className={shellMainClassName}>
        {l.split && secondary ? (
          <div className={splitClassName}>
            <ScrollArea>{children}</ScrollArea>
            <ScrollArea>{secondary}</ScrollArea>
          </div>
        ) : (
          <ScrollArea>{children}</ScrollArea>
        )}
      </div>
    ),
    agent:
      l.agent && !compact && !l.focus ? (
        <aside className={shellAgentClassName}>{agentContent}</aside>
      ) : null,
  };
  return (
    <div className={shellSurfaceClassName} ref={host} style={style}>
      <span ref={probe} className={breakpointProbeClassName} />
      <header className={shellHeaderClassName}>
        <IconButton
          label="Toggle navigation"
          aria-pressed={l.navigation}
          onClick={() => onLayout({ ...l, navigation: !l.navigation })}
        >
          <PanelLeft />
        </IconButton>
        {toolbar}
        <span className={spacerClassName} />
        <ButtonGroup label="Workspace layout">
          {secondary && (
            <IconButton
              label="Split view"
              aria-pressed={l.split}
              onClick={() => onLayout({ ...l, split: !l.split })}
            >
              <Columns2 />
            </IconButton>
          )}
          <IconButton
            label="Focus mode"
            aria-pressed={l.focus}
            onClick={() => onLayout({ ...l, focus: !l.focus })}
          >
            <Maximize />
          </IconButton>
          {compact ? (
            <Dialog
              title="Workspace agent"
              open={overlay}
              onOpenChange={setOverlay}
              trigger={
                <IconButton label="Open agent">
                  <PanelRight />
                </IconButton>
              }
            >
              {agentContent}
            </Dialog>
          ) : (
            <IconButton
              label="Toggle agent"
              aria-pressed={l.agent}
              onClick={() => onLayout({ ...l, agent: !l.agent })}
            >
              <PanelRight />
            </IconButton>
          )}
        </ButtonGroup>
      </header>
      <div className={shellBodyClassName}>
        {renderPanels ? (
          renderPanels(panes)
        ) : (
          <>
            {panes.navigation}
            {panes.main}
            {panes.agent}
          </>
        )}
      </div>
    </div>
  );
}
