/** Public data and callback contracts for confirm-action. */

import type { ReactElement } from "react";
export type ConfirmActionProps = {
  onOpenChange?: (open: boolean) => void;
  title: string;
  description: string;
  action: string;
  onConfirm: () => void;
} & ({ trigger: ReactElement; open?: boolean } | { trigger?: undefined; open: boolean });
