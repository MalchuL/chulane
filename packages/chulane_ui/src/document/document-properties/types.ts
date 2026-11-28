/** Public data and callback contracts for document-properties. */

import type { ReactNode } from "react";
export type DocumentPropertiesProps = {
  properties: { label: string; value: ReactNode }[];
};
