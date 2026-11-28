/** Resolves shell layout against the inherited breakpoint and owns the compact agent dialog. */
import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { WorkspaceShellProps } from "./types.js";

/**
 * Observe the shell and its token probe and resolve the applicable panel presentation.
 * @param props Host-owned panel widths and agent visibility callback.
 * @returns The probe ref, compact state, panel width styles and dialog controls.
 */
export function useWorkspaceLayout({
  sidebarWidth,
  agentWidth,
  onAgentOpenChange,
}: Pick<WorkspaceShellProps, "sidebarWidth" | "agentWidth" | "onAgentOpenChange">) {
  const breakpointProbe = useRef<HTMLSpanElement>(null);
  const [compact, setCompact] = useState(false);
  const [agentDialogOpen, setAgentDialogOpen] = useState(false);

  useEffect(() => {
    const probe = breakpointProbe.current;
    const shell = probe?.parentElement;
    if (!shell || !probe) {
      return;
    }
    const observer = new ResizeObserver(() => {
      const compact = shell.offsetWidth <= probe.offsetWidth;
      setCompact(compact);
      if (!compact) {
        setAgentDialogOpen(false);
      }
    });
    observer.observe(shell);
    observer.observe(probe);
    return () => observer.disconnect();
  }, []);

  /** Close the agent in its current presentation. */
  function closeAgent() {
    if (compact) {
      setAgentDialogOpen(false);
    } else {
      onAgentOpenChange(false);
    }
  }

  const panelWidths = {
    "--ui-user-nav": sidebarWidth === undefined ? undefined : `${sidebarWidth}px`,
    "--ui-user-agent": agentWidth === undefined ? undefined : `${agentWidth}px`,
  } as CSSProperties;
  return {
    breakpointProbe,
    compact,
    panelWidths,
    agentDialogOpen,
    setAgentDialogOpen,
    closeAgent,
  };
}
