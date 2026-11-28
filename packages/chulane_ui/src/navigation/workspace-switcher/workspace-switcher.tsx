/** Presents workspace choices and storage locations in a menu anchored to a button. */
import { cn } from "cn";
import { ChevronDown, Cloud, HardDrive, Layers } from "lucide-react";
import { ActionMenu } from "../../commands/action-menu/action-menu.js";
import { Button } from "../../foundation/button/button.js";
import { IconButton } from "../../foundation/icon-button/icon-button.js";
import type { WorkspaceOption, WorkspaceSwitcherProps } from "./types.js";

const locations = {
  local: { icon: HardDrive, description: "Local workspace" },
  cloud: { icon: Cloud, description: "Cloud workspace" },
};

/**
 * Switch the active knowledge workspace from a navigation header.
 *
 * The host supplies the workspace options, owns selection and performs the
 * switch. The component presents the options and manages the trigger and menu.
 *
 * @example
 * <WorkspaceSwitcher value="Personal" options={["Personal", "Research"]} onValueChange={switchWorkspace} />
 * @param props Controlled workspace, available options and trigger button attributes.
 * @returns The workspace menu and its trigger.
 */
export function WorkspaceSwitcher({
  value,
  options,
  onValueChange,
  compact,
  className,
  ...rest
}: WorkspaceSwitcherProps) {
  const selectorClassName = "cu-workspace-selector";
  const smallIconClassName = "cu-icon-sm";
  const items = options.map((option) => {
    const workspace = getWorkspacePresentation(option);
    return {
      ...workspace,
      id: workspace.label,
      checked: value === workspace.label,
      onSelect: () => onValueChange(workspace.label),
    };
  });
  const current = items.find((item) => item.checked);
  const Icon = current?.icon ?? Layers;
  const triggerProps = { "aria-description": current?.description, ...rest };
  return (
    <ActionMenu
      label="Workspaces"
      trigger={
        compact ? (
          <IconButton label="Switch workspace" {...triggerProps} className={className}>
            <Icon />
          </IconButton>
        ) : (
          <Button variant="ghost" {...triggerProps} className={cn(selectorClassName, className)}>
            <Icon aria-hidden />
            <span>{value}</span>
            <ChevronDown className={smallIconClassName} aria-hidden />
          </Button>
        )
      }
      items={items}
    />
  );
}

/**
 * Resolve a workspace label, icon and optional storage description.
 * @param option A workspace name or a record with its storage location.
 * @returns The fields shown in the trigger and menu.
 */
function getWorkspacePresentation(option: string | WorkspaceOption) {
  if (typeof option === "string") {
    return { label: option, icon: Layers, description: undefined };
  }
  return { label: option.label, ...locations[option.location] };
}
