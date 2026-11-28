/** Live Checkbox usage, also displayed as source in the catalog. */
import { useState } from "react";
import { Checkbox } from "chulane_ui";

export default function Example() {
  const [checked, setChecked] = useState<boolean | "indeterminate">("indeterminate");
  return (
    <>
      <Checkbox label="Show recent pages" checked={checked} onCheckedChange={setChecked} />
      <Checkbox label="Read-only preference" checked disabled />
    </>
  );
}
