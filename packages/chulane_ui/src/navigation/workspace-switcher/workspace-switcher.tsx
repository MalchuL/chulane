/** workspace switcher presentation and interaction contract. */
import type { WorkspaceSwitcherProps } from "./types.js";
import { IconButton } from "../../foundation/icon-button/icon-button.js";
import { ChevronDown, Cloud, HardDrive, Layers } from "lucide-react";
import { ActionMenu } from "../../commands/action-menu/action-menu.js";
import { Button } from "../../foundation/button/button.js";

export type { WorkspaceSwitcherProps, WorkspaceOption } from "./types.js";
/**
 * Switch the active knowledge workspace from the navigation header.
 * @param props Presentation values and host callbacks described by the public props type.
 * @returns The rendered WorkspaceSwitcher view.
 */
export function WorkspaceSwitcher({ value, options, onChange, compact }: WorkspaceSwitcherProps) {
  const workspaceSelectorClassName = "cu-workspace-selector";
  const items = options.map((option) => {
    const label = typeof option === "string" ? option : option.label;
    const location = typeof option === "string" ? undefined : option.location;
    let icon = Layers;
    let description;
    if (location === "local") {
      icon = HardDrive;
      description = "Local workspace";
    } else if (location === "cloud") {
      icon = Cloud;
      description = "Cloud workspace";
    }
    return {
      id: label,
      label,
      icon,
      description,
      checked: value === label,
      run: () => onChange(label),
    };
  });
  const current = items.find((item) => item.checked);
  const Icon = current?.icon ?? Layers;
  return (
    <ActionMenu
      label="Workspaces"
      trigger={
        compact ? (
          <IconButton label="Switch workspace" aria-description={current?.description}>
            <Icon />
          </IconButton>
        ) : (
          <Button
            variant="ghost"
            aria-description={current?.description}
            className={workspaceSelectorClassName}
          >
            <Icon aria-hidden />
            <span>{value}</span>
            <ChevronDown aria-hidden />
          </Button>
        )
      }
      items={items}
    />
  );
}
