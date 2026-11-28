/** sidebar presentation and interaction contract. */
import { Popover } from "../../foundation/popover/popover.js";
import { ScrollArea } from "../../components/ui/scroll-area.js";

import { SidebarHeader, SidebarFooter, SidebarGroup } from "../../components/ui/sidebar.js";

import type { SidebarProps } from "./types.js";
import { useState } from "react";
import {
  ChevronRight,
  Settings2,
  Folder,
  PanelLeft,
  PanelLeftClose,
  Columns2,
  Eye,
  ListOrdered,
  ArrowUp,
  ArrowDown,
  RotateCcw,
} from "lucide-react";
import { defaultSidebar } from "./preferences.js";
import { NavigationTree } from "../navigation-tree/navigation-tree.js";
import { IconButton } from "../../foundation/icon-button/icon-button.js";
import { Button } from "../../foundation/button/button.js";
import { ContextMenu } from "../../commands/context-menu/context-menu.js";
import { ActionMenu } from "../../commands/action-menu/action-menu.js";
import type { MenuEntry } from "../../commands/types.js";

export type { SidebarProps } from "./types.js";

/**
 * Organize collections, resize the surrounding shell and customize section visibility or order.
 * @param props Presentation values and host callbacks described by the public props type.
 * @returns The rendered Sidebar view.
 */
export function Sidebar({
  header,
  compactHeader,
  destinations,
  footer,
  sections,
  preferences: p,
  onPreferences,
  compact,
  ...tree
}: SidebarProps) {
  const sidebarClassName = "cu-sidebar";
  const sidebarScrollClassName = "cu-sidebar-scroll";
  const destinationClassName = "cu-destination";
  const navColumnsClassName = "cu-nav-columns";
  const groupButtonClassName = "cu-nav-group-button";
  const navSectionClassName = "cu-nav-section";
  const [compactSection, setCompactSection] = useState<string | null>(null);
  const [active, setActive] = useState("");
  const mode = compact ? "compact" : p.mode;
  const ordered = [...new Set([...p.order, ...sections.map((s) => s.id)])].flatMap((id) =>
    sections.filter((s) => s.id === id),
  );
  const visible = ordered.filter((s) => !p.hidden.includes(s.id));
  const current = visible.find((s) => s.id === active) ?? visible[0];
  const toggle = (key: "hidden" | "collapsed", id: string) =>
    onPreferences({
      ...p,
      [key]: p[key].includes(id) ? p[key].filter((x) => x !== id) : [...p[key], id],
    });
  function move(id: string, target: string) {
    const ids = ordered.map((s) => s.id);
    const to = ids.indexOf(target);
    if (to < 0 || !ids.includes(id)) {
      return;
    }
    const next = ids.filter((x) => x !== id);
    next.splice(to, 0, id);
    onPreferences({ ...p, order: next });
  }
  const settings: MenuEntry[] = [
    {
      id: "mode",
      label: "Navigation mode",
      icon: PanelLeft,
      items: (["compact", "standard", "expanded"] as const).map((mode) => ({
        id: mode,
        label: mode,
        icon: { compact: PanelLeftClose, standard: PanelLeft, expanded: Columns2 }[mode],
        checked: p.mode === mode,
        run: () => onPreferences({ ...p, mode }),
      })),
    },
    {
      id: "visible",
      label: "Visible sections",
      icon: Eye,
      items: ordered.map((s) => ({
        id: s.id,
        label: s.label,
        icon: s.icon ?? Folder,
        checked: !p.hidden.includes(s.id),
        run: () => toggle("hidden", s.id),
      })),
    },
    {
      id: "order",
      label: "Reorder sections",
      icon: ListOrdered,
      items: ordered.flatMap((s, i) =>
        [-1, 1].map((d) => ({
          id: s.id + d,
          icon: d < 0 ? ArrowUp : ArrowDown,
          label: "Move " + s.label + (d < 0 ? " up" : " down"),
          disabled: !ordered[i + d],
          run: () => move(s.id, ordered[i + d].id),
        })),
      ),
    },
    {
      id: "reset",
      label: "Restore defaults",
      icon: RotateCcw,
      run: () => onPreferences(defaultSidebar(sections)),
    },
  ];
  return (
    <ContextMenu asChild label="Customize sidebar" items={settings}>
      <nav className={sidebarClassName} aria-label="Workspace navigation" data-mode={mode}>
        <SidebarHeader>{mode === "compact" ? compactHeader : header}</SidebarHeader>
        <ScrollArea className={sidebarScrollClassName}>
          {destinations?.map((d) =>
            mode === "compact" ? (
              <IconButton
                key={d.id}
                label={d.label}
                aria-pressed={tree.selected === d.id}
                onClick={() => tree.onSelect(d.id)}
              >
                <d.icon />
              </IconButton>
            ) : (
              <Button
                key={d.id}
                className={destinationClassName}
                variant="ghost"
                aria-pressed={tree.selected === d.id}
                onClick={() => tree.onSelect(d.id)}
              >
                <d.icon />
                {d.label}
              </Button>
            ),
          )}
          <div className={navColumnsClassName}>
            <div>
              {visible.map((s) => {
                const SectionIcon = s.icon ?? Folder;
                const closed = p.collapsed.includes(s.id);
                return (
                  <SidebarGroup
                    className={navSectionClassName}
                    key={s.id}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => move(e.dataTransfer.getData("text/chulane-section"), s.id)}
                  >
                    <div
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData("text/chulane-section", s.id)}
                    >
                      {mode === "compact" ? (
                        <Popover
                          label={s.label}
                          open={compactSection === s.id}
                          onOpenChange={(open) => setCompactSection(open ? s.id : null)}
                          trigger={
                            <IconButton label={s.label}>
                              <SectionIcon />
                            </IconButton>
                          }
                        >
                          <NavigationTree
                            {...tree}
                            items={s.items}
                            onSelect={(id) => {
                              tree.onSelect(id);
                              setCompactSection(null);
                            }}
                          />
                        </Popover>
                      ) : (
                        <Button
                          className={groupButtonClassName}
                          variant="ghost"
                          aria-expanded={mode === "expanded" ? current === s : !closed}
                          onClick={() =>
                            mode === "expanded" ? setActive(s.id) : toggle("collapsed", s.id)
                          }
                        >
                          <ChevronRight aria-hidden />
                          {s.label}
                        </Button>
                      )}
                    </div>
                    {mode === "standard" && !closed && <NavigationTree {...tree} items={s.items} />}
                  </SidebarGroup>
                );
              })}
            </div>
            {mode === "expanded" && current && <NavigationTree {...tree} items={current.items} />}
          </div>
        </ScrollArea>
        <SidebarFooter>
          {mode !== "compact" && footer}
          <ActionMenu
            label="Customize sidebar"
            trigger={
              <IconButton label="Customize sidebar">
                <Settings2 />
              </IconButton>
            }
            items={settings}
          />
        </SidebarFooter>
      </nav>
    </ContextMenu>
  );
}
