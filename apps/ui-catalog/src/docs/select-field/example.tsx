/** Live SelectField usage, also displayed as source in the catalog. */
import { useState } from "react";
import { SelectField } from "chulane_ui";

export default function Example() {
  const [value, setValue] = useState("Local");
  return (
    <SelectField label="Model" value={value} options={["Local", "Cloud"]} onChange={setValue} />
  );
}
