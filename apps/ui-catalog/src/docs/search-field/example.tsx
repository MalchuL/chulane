/** Live SearchField usage, also displayed as source in the catalog. */
import { useState } from "react";
import { SearchField } from "chulane_ui";

export default function Example() {
  const stackClassName = "cu-stack";
  const [value, setValue] = useState("");
  return (
    <div className={stackClassName}>
      <SearchField
        label="Search documents"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      {["Field notes", "Research atlas"]
        .filter((p) => p.toLowerCase().includes(value.toLowerCase()))
        .join(" · ") || "No results"}
    </div>
  );
}
