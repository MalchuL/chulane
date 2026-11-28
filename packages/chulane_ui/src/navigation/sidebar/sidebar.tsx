/** Composes workspace navigation with host-owned selection and presentation preferences. */
import { cn } from "cn";
import { ContextMenu } from "../../commands/context-menu/context-menu.js";
import { ScrollArea } from "../../components/ui/scroll-area.js";
import { useSidebarSections } from "./hooks.js";
import { SidebarDestinations, SidebarHeading, SidebarSections, SidebarUtilities } from "./parts.js";
import { createSidebarSettings } from "./settings.js";
import type { SidebarProps } from "./types.js";

/**
 * Organize workspace destinations and collections in compact, standard and expanded layouts.
 *
 * The host owns items, navigation and saved preferences. The sidebar owns the
 * currently previewed section and reports preference updates to the host.
 *
 * @example
 * <Sidebar header="Workspace" footer="Local" sections={sections} preferences={preferences}
 *   onPreferencesChange={setPreferences} onSelectedChange={openPage} />
 * @param props Root navigation attributes, content slots and controlled navigation.
 * @returns The workspace navigation landmark.
 */
export function Sidebar({
  header,
  compactHeader,
  destinations,
  footer,
  sections,
  preferences,
  onPreferencesChange,
  compact,
  selected,
  onSelectedChange,
  actions,
  className,
  ...rest
}: SidebarProps) {
  const sidebarClassName = "cu-sidebar";
  const scrollClassName = "cu-sidebar-scroll";
  const mode = compact ? "compact" : preferences.mode;
  const state = useSidebarSections({ sections, preferences, onPreferencesChange });
  const settings = createSidebarSettings({ sections, preferences, onPreferencesChange, ...state });
  const tree = { selected, onSelectedChange, actions };

  return (
    <ContextMenu asChild label="Customize sidebar" items={settings}>
      <nav
        aria-label="Workspace navigation"
        {...rest}
        className={cn(sidebarClassName, className)}
        data-mode={mode}
      >
        <SidebarHeading mode={mode} header={header} compactHeader={compactHeader} />
        <ScrollArea className={scrollClassName}>
          <SidebarDestinations destinations={destinations} mode={mode} {...tree} />
          <SidebarSections
            mode={mode}
            collapsed={preferences.collapsed}
            state={state}
            tree={tree}
          />
        </ScrollArea>
        <SidebarUtilities mode={mode} footer={footer} settings={settings} />
      </nav>
    </ContextMenu>
  );
}
