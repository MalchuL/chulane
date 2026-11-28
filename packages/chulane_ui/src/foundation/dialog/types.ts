/** Public data and callback contracts for dialog. */

import type { ReactNode, ReactElement, RefObject } from "react";
export type DialogProps = {
  title: string;
  initialFocus?: RefObject<HTMLElement | null>;
  description?: string;
  trigger?: ReactElement;
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};
