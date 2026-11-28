/** Public data and callback contracts for chip. */

import type { ComponentType } from "react";
export type ChipProps = {
  label: string;
  icon?: ComponentType;
  onRemove: () => void;
};
