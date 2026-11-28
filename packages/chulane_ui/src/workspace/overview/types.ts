/** Public content contracts for the workspace overview. */
import type { ComponentProps } from "react";
import type { PageReference } from "../../document/breadcrumbs/types.js";

/** A labeled group of links to workspace documents or projects. */
export type WorkspaceOverviewSection = {
  /** Visible group label. */
  label: string;
  /** Links displayed in host-provided order. An empty group is hidden. */
  items: readonly PageReference[];
};

/** Heading, grouped links and root section props for WorkspaceOverview. */
export type WorkspaceOverviewProps = Omit<ComponentProps<"section">, "children" | "title"> & {
  /** Visible overview heading. */
  title: string;
  /** Groups displayed in host-provided order. */
  sections: readonly WorkspaceOverviewSection[];
};
