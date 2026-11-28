/** Live WorkspaceOverview usage, also displayed as source in the catalog. */
import { WorkspaceOverview } from "@chulane/ui";
const reference = { id: "field", label: "Field notes", href: "#field-notes" };

/**
 * Demonstrate host-provided recent documents and pinned project links.
 * @returns The overview catalog example.
 */
export default function Example() {
  return (
    <WorkspaceOverview
      title="Personal"
      sections={[
        { label: "Recent documents", items: [reference] },
        {
          label: "Pinned projects",
          items: [
            {
              id: "atlas",
              label: "Research atlas",
              href: "/examples/knowledge-workspace",
            },
          ],
        },
      ]}
    />
  );
}
