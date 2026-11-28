/** Public data and callback contracts for surface. */

import type { ReactNode } from "react";
export type DocumentSurfaceProps = {
  title: string;
  properties?: ReactNode;
  children: ReactNode;
  fullWidth?: boolean;
};
