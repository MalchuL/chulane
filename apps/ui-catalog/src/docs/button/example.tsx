/** Live Button usage, also displayed as source in the catalog. */
import { useState } from "react";
import { Button } from "chulane_ui";

export default function Example() {
  const [saved, setSaved] = useState(false);
  return (
    <Button onClick={() => setSaved(true)} disabled={saved}>
      {saved ? "Saved" : "Save changes"}
    </Button>
  );
}
