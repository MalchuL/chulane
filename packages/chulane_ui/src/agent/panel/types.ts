/** Public data and callback contracts for panel. */

import type { ReactNode } from "react";
import type { MenuEntry } from "../../commands/types.js";
export type AgentPanelProps = {
  title: string;
  children: ReactNode;
  composer: ReactNode;
  selector?: ReactNode;
  queue?: ReactNode;
  menu: MenuEntry[];
  onNew: () => void;
  onClose?: () => void;
};
