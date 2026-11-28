/** Public data and callback contracts for command-toolbar. */
import type { ButtonLayout } from "../../foundation/button-group/types.js";

import type { Command } from "../types.js";
export type CommandToolbarProps = {
  buttonLayout?: ButtonLayout;
  label: string;
  commands: Command[];
};
