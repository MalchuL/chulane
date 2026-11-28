/** Public data and callback contracts for switching workspaces. */
import type { ComponentProps } from "react";

/** A workspace with an explicit storage location. */
export type WorkspaceOption = {
  /** Workspace name and selection value. */
  label: string;
  /** Where the workspace is stored. */
  location: "local" | "cloud";
};

/** Controlled workspace selection and attributes for the trigger button. */
export type WorkspaceSwitcherProps = Omit<ComponentProps<"button">, "children" | "value"> & {
  /** Label of the active workspace. */
  value: string;
  /** Available workspace names or options with explicit storage locations. */
  options: readonly (string | WorkspaceOption)[];
  /** Show only the active workspace icon. Defaults to false. */
  compact?: boolean;
  /** Receives the name chosen from the workspace menu. */
  onValueChange: (workspace: string) => void;
};
