/** Public data and callback contracts for command-palette. */

import type { ReactElement } from "react";
import type { Command } from "../types.js";
export type CommandPaletteProps = {
  commands: Command[];
  trigger?: ReactElement;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};
