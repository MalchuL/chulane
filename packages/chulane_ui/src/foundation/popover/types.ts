/** Public data and callback contracts for popover. */

import type { ReactElement, ReactNode } from "react";
export type PopoverProps = {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  label: string;
  trigger: ReactElement;
  children: ReactNode;
};
