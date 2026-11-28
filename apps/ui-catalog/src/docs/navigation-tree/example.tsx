/** Live NavigationTree usage, also displayed as source in the catalog. */
import { useState } from "react";
import { NavigationTree } from "@chulane/ui";

export default function Example() {
  const [selected, setSelected] = useState("");
  return (
    <NavigationTree
      selected={selected}
      items={[
        {
          id: "atlas",
          label: "Research atlas",
          children: [{ id: "field", label: "Field notes" }],
        },
      ]}
      onSelectedChange={setSelected}
    />
  );
}
