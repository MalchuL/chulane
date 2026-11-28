/** Public data and callback contracts for button-group. */

import type { ReactNode } from "react";
export type ButtonLayout = "grouped" | "separate";
export type ButtonGroupProps = {
  buttonLayout?: ButtonLayout;
  label: string;
  children: ReactNode;
};
