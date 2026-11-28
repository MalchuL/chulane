/** Live DocumentImage usage, also displayed as source in the catalog. */
import { DocumentImage } from "chulane_ui";

export default function Example() {
  return (
    <DocumentImage
      src="/field-study.svg"
      alt="Elevation profile of the north ridge"
      caption="North ridge elevation study."
      attribution={{ label: "Field notebook", href: "/examples/document-editor" }}
    />
  );
}
