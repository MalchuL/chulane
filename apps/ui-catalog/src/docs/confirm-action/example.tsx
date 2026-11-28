/** Live ConfirmAction usage, also displayed as source in the catalog. */
import { useState } from "react";
import { Button, ConfirmAction } from "chulane_ui";

export default function Example() {
  const [removed, setRemoved] = useState(false);
  return (
    <>
      {removed ? (
        <Button onClick={() => setRemoved(false)}>Undo removal</Button>
      ) : (
        <ConfirmAction
          action="Remove"
          title="Remove attachment?"
          description="The source document stays in your library."
          trigger={<Button variant="outline">Remove attachment</Button>}
          onConfirm={() => setRemoved(true)}
        />
      )}
    </>
  );
}
