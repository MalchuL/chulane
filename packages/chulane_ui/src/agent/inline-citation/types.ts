/** A host-owned reference and an optional excerpt for its preview. */
import type { PageReference } from "../../document/breadcrumbs/types.js";
export type InlineCitationProps = {
  source: PageReference & { description?: string };
};
