/** Live Chip usage, also displayed as source in the catalog. */
import { useState } from "react";
import { Button, Chip } from "@chulane/ui";

export default function Example() {
  const [included, setIncluded] = useState(true);
  return (
    <>
      {included ? (
        <Chip label="Field notes" onRemove={() => setIncluded(false)} />
      ) : (
        <Button onClick={() => setIncluded(true)}>Attach Field notes</Button>
      )}
    </>
  );
}
