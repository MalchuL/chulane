/** Render a citation within a sentence. */
import { InlineCitation } from "@chulane/ui";

/**
 * Demonstrates a link with a preview inside a sentence.
 * @returns A citation to the catalog's example document.
 */
export default function Example() {
  return (
    <p>
      The observations are recorded in{" "}
      <InlineCitation
        source={{
          label: "Field notes",
          href: "/examples/document-editor",
          description: "Observations from the northern trail.",
        }}
      />
      .
    </p>
  );
}
