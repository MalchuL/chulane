/** Public data and callback contracts for document-tabs. */

import type { ComponentType } from "react";
export type DocumentTab = {
  id: string;
  title: string;
  icon?: ComponentType;
  description?: string;
};
export type DocumentTabsProps = {
  label?: string;
  tabs: DocumentTab[];
  active: string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onMove: (id: string, target: string) => void;
};
