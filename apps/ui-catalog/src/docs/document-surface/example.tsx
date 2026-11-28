/** Live DocumentSurface usage, also displayed as source in the catalog. */
import { Badge, DocumentSurface } from "@chulane/ui";

export default function Example() {
  return (
    <DocumentSurface heading="Field notes" properties={<Badge>Research</Badge>}>
      <p>We recorded the changing light along the northern trail.</p>
    </DocumentSurface>
  );
}
