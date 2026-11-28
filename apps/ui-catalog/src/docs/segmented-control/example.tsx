/** Live SegmentedControl usage, also displayed as source in the catalog. */
import { useState } from "react";
import { SegmentedControl } from "@chulane/ui";

/**
 * Demonstrate a navigation mode controlled by the host.
 * @returns The current mode and its available alternatives as a segmented control.
 */
export default function Example() {
  const [value, setValue] = useState("Standard");
  return (
    <SegmentedControl
      label="Navigation mode"
      value={value}
      options={["Compact", "Standard", "Expanded"]}
      onValueChange={setValue}
    />
  );
}
