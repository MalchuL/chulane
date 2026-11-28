/** Public data and callback contracts for workspace-switcher. */

export type WorkspaceOption = { label: string; location: "local" | "cloud" };
export type WorkspaceSwitcherProps = {
  value: string;
  options: readonly (string | WorkspaceOption)[];
  compact?: boolean;
  onChange: (workspace: string) => void;
};
