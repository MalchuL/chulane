/** Public data and callback contracts for selection-toolbar. */

import type { ReactNode } from "react";
import type { Command } from "../../commands/types.js";
export type SelectionToolbarProps = {
  commands: Command[];
  visible: boolean;
  leading?: ReactNode;
  trailing?: ReactNode;
};
