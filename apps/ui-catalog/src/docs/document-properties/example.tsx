/** Live DocumentProperties usage, also displayed as source in the catalog. */
import { Badge, DocumentProperties } from "chulane_ui";
const reference = { id: "field", label: "Field notes", href: "#field-notes" };

export default function Example() {
  return (
    <DocumentProperties
      properties={[
        { label: "Collection", value: "Research" },
        { label: "Tags", value: <Badge>Fieldwork</Badge> },
        { label: "Linked page", value: <a href={reference.href}>{reference.label}</a> },
      ]}
    />
  );
}
