/** Live SegmentedControl usage, also displayed as source in the catalog. */
import { useState } from "react";
import { SegmentedControl } from "chulane_ui";

export default function Example() {
  const [value, setValue] = useState("Standard");
  return (
    <SegmentedControl
      label="Navigation mode"
      value={value}
      options={["Compact", "Standard", "Expanded"]}
      onChange={setValue}
    />
  );
}
