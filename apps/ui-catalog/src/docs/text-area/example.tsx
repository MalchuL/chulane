/** Live TextArea usage, also displayed as source in the catalog. */
import { useState } from "react";
import { TextArea } from "chulane_ui";

export default function Example() {
  const [text, setText] = useState("");
  return (
    <TextArea
      label="Journal entry"
      placeholder="Write an observation…"
      value={text}
      onChange={(e) => setText(e.target.value)}
    />
  );
}
