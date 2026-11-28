/** Live Breadcrumbs usage, also displayed as source in the catalog. */
import { Breadcrumbs } from "@chulane/ui";
const reference = { id: "field", label: "Field notes", href: "#field-notes" };

export default function Example() {
  return (
    <Breadcrumbs
      items={[
        { id: "workspace", label: "Personal", href: "/examples/knowledge-workspace" },
        reference,
      ]}
    />
  );
}
