/** Live WorkspaceSwitcher usage, also displayed as source in the catalog. */
import { useState } from "react";
import { WorkspaceSwitcher } from "@chulane/ui";

import { workspaceOptions } from "../../examples/fixtures";
export default function Example() {
  const [value, setValue] = useState("Personal");
  return <WorkspaceSwitcher value={value} options={workspaceOptions} onValueChange={setValue} />;
}
