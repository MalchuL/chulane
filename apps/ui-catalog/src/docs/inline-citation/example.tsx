/** Render a citation within a sentence. */
import { InlineCitation } from "chulane_ui";
export default function Example() {
  return (
    <p>
      The observations are recorded in{" "}
      <InlineCitation
        source={{
          id: "field",
          label: "Field notes",
          href: "/examples/document-editor",
          description: "Observations from the northern trail.",
        }}
      />
      .
    </p>
  );
}
