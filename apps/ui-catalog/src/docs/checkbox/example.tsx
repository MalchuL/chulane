/** Live Checkbox usage, also displayed as source in the catalog. */
import { useState } from "react";
import { Checkbox } from "@chulane/ui";
import type { CheckboxCheckedState } from "@chulane/ui";

/** Shows a controlled mixed checkbox and a disabled uncontrolled checkbox. */
export default function Example() {
  const [checked, setChecked] = useState<CheckboxCheckedState>("indeterminate");
  return (
    <>
      <Checkbox label="Show recent pages" checked={checked} onCheckedChange={setChecked} />
      <Checkbox label="Read-only preference" defaultChecked disabled />
    </>
  );
}
