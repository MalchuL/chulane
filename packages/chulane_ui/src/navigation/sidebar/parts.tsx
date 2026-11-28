/** Private sidebar regions and section controls for each navigation mode. */
import { ChevronRight, FileText, Folder, Settings2 } from "lucide-react";
import { ActionMenu } from "../../commands/action-menu/action-menu.js";
import type { MenuEntry } from "../../commands/types.js";
import { SidebarFooter, SidebarGroup, SidebarHeader } from "../../components/ui/sidebar.js";
import { Button } from "../../foundation/button/button.js";
import { IconButton } from "../../foundation/icon-button/icon-button.js";
import { Popover } from "../../foundation/popover/popover.js";
import { NavigationTree } from "../navigation-tree/index.js";
import type { useSidebarSections } from "./hooks.js";
import type { SidebarDestination, SidebarMode, SidebarProps, SidebarSection } from "./types.js";

type SidebarSelection = Pick<SidebarProps, "selected" | "onSelectedChange" | "actions">;
type SectionsState = ReturnType<typeof useSidebarSections>;
type SectionsProps = {
  mode: SidebarMode;
  collapsed: readonly string[];
  state: SectionsState;
  tree: SidebarSelection;
};
type SectionProps = Omit<SectionsProps, "collapsed"> & {
  section: SidebarSection;
  collapsed: boolean;
};

const sectionDragType = "text/chulane-section";
const customizeLabel = "Customize sidebar";

/**
 * Show the host's regular header or compact rail header.
 * @param props Both host slots and the effective mode.
 * @returns The sidebar header region.
 */
export function SidebarHeading({
  mode,
  header,
  compactHeader,
}: Pick<SidebarProps, "header" | "compactHeader"> & { mode: SidebarMode }) {
  return <SidebarHeader>{mode === "compact" ? compactHeader : header}</SidebarHeader>;
}

/**
 * Render the primary destinations in the host's order.
 * @param props Destinations, selection, navigation callback and the effective mode.
 * @returns The destination buttons.
 */
export function SidebarDestinations({
  destinations = [],
  selected,
  onSelectedChange,
  mode,
}: Pick<SidebarProps, "destinations" | "selected" | "onSelectedChange"> & { mode: SidebarMode }) {
  return destinations.map((destination) => (
    <DestinationButton
      key={destination.id}
      destination={destination}
      selected={selected === destination.id}
      onSelectedChange={onSelectedChange}
      compact={mode === "compact"}
    />
  ));
}

/**
 * Select a destination with the same accessible name in both button layouts.
 * @param props Destination, selection state, host callback and compact flag.
 * @returns A text button or a named icon button.
 */
function DestinationButton({
  destination,
  selected,
  onSelectedChange,
  compact,
}: {
  destination: SidebarDestination;
  selected: boolean;
  onSelectedChange: SidebarSelection["onSelectedChange"];
  compact: boolean;
}) {
  const className = "cu-destination";
  const labelClassName = "cu-nav-label";
  const Icon = destination.icon ?? FileText;
  const buttonProps = {
    className,
    "aria-pressed": selected,
    onClick: () => onSelectedChange(destination.id),
  };
  if (compact) {
    return (
      <IconButton {...buttonProps} label={destination.label}>
        <Icon />
      </IconButton>
    );
  }
  return (
    <Button {...buttonProps} variant="ghost">
      <span aria-hidden>
        <Icon />
      </span>
      <span className={labelClassName}>{destination.label}</span>
    </Button>
  );
}

/**
 * Render in-place trees, compact popovers or the active tree in a second column.
 * @param props Current mode, collapsed section IDs, section state and navigation callbacks.
 * @returns The sidebar's section region.
 */
export function SidebarSections({ mode, collapsed, state, tree }: SectionsProps) {
  const columnsClassName = "cu-nav-columns";
  return (
    <div className={columnsClassName}>
      <div>
        {state.visible.map((section) => (
          <Section
            key={section.id}
            section={section}
            mode={mode}
            state={state}
            tree={tree}
            collapsed={collapsed.includes(section.id)}
          />
        ))}
      </div>
      {mode === "expanded" && state.current && (
        <NavigationTree {...tree} items={state.current.items} />
      )}
    </div>
  );
}

/**
 * Own a section's drag target and standard-mode tree.
 * @param props Section, mode, disclosure state and host selection callbacks.
 * @returns One reorderable sidebar group.
 */
function Section({ section, mode, state, tree, collapsed }: SectionProps) {
  const className = "cu-nav-section";
  return (
    <SidebarGroup
      className={className}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => state.moveSection(event.dataTransfer.getData(sectionDragType), section.id)}
    >
      <div
        draggable
        onDragStart={(event) => event.dataTransfer.setData(sectionDragType, section.id)}
      >
        <SectionHeader
          section={section}
          mode={mode}
          state={state}
          tree={tree}
          collapsed={collapsed}
        />
      </div>
      {mode === "standard" && !collapsed && <NavigationTree {...tree} items={section.items} />}
    </SidebarGroup>
  );
}

/**
 * Open a section popover, select its expanded column or toggle its tree.
 * @param props Section data, disclosure state and host selection callbacks.
 * @returns The section control for the effective mode.
 */
function SectionHeader({ section, mode, state, tree, collapsed }: SectionProps) {
  const className = "cu-nav-group-button";
  const smallIconClassName = "cu-icon-sm";
  const labelClassName = "cu-nav-label";
  if (mode === "compact") {
    return <CompactSection section={section} state={state} tree={tree} />;
  }
  const expanded = mode === "expanded";
  return (
    <Button
      className={className}
      variant="ghost"
      aria-expanded={expanded ? state.current?.id === section.id : !collapsed}
      onClick={() =>
        expanded ? state.setActiveSection(section.id) : state.toggleSection("collapsed", section.id)
      }
    >
      <ChevronRight className={smallIconClassName} aria-hidden />
      <span className={labelClassName}>{section.label}</span>
    </Button>
  );
}

/**
 * Display a section's tree in a popover and dismiss it after selection.
 * @param props Section, active popover state and host selection callbacks.
 * @returns The compact section trigger and its popover.
 */
function CompactSection({
  section,
  state,
  tree,
}: Pick<SectionProps, "section" | "state" | "tree">) {
  const className = "cu-sidebar-section-popover";
  const Icon = section.icon ?? Folder;
  return (
    <Popover
      label={section.label}
      open={state.compactSection === section.id}
      onOpenChange={(open) => state.setCompactSection(open ? section.id : null)}
      trigger={
        <IconButton label={section.label}>
          <Icon />
        </IconButton>
      }
    >
      <div className={className}>
        <NavigationTree
          {...tree}
          items={section.items}
          onSelectedChange={(id) => {
            tree.onSelectedChange(id);
            state.setCompactSection(null);
          }}
        />
      </div>
    </Popover>
  );
}

/**
 * Display the host footer when there is room and keep settings available in every mode.
 * @param props Effective mode, host footer and sidebar settings commands.
 * @returns The sidebar footer region.
 */
export function SidebarUtilities({
  mode,
  footer,
  settings,
}: Pick<SidebarProps, "footer"> & { mode: SidebarMode; settings: MenuEntry[] }) {
  const contentClassName = "cu-sidebar-footer-content";
  return (
    <SidebarFooter>
      {mode !== "compact" && <div className={contentClassName}>{footer}</div>}
      <ActionMenu
        label={customizeLabel}
        items={settings}
        trigger={
          <IconButton label={customizeLabel}>
            <Settings2 />
          </IconButton>
        }
      />
    </SidebarFooter>
  );
}
