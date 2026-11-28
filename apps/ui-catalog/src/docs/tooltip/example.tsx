/** Shows a tooltip that provides additional context for a control. */
import { Button, Tooltip } from "@chulane/ui";
import { useState } from "react";

/**
 * Attach a hoverable description to a toggle with a visible label.
 * @returns A toggle with explanatory text on hover or focus.
 */
export default function Example() {
  const [offline, setOffline] = useState(false);
  return (
    <Tooltip
      hoverable
      trigger={
        <Button variant="outline" aria-pressed={offline} onClick={() => setOffline(!offline)}>
          Available offline
        </Button>
      }
    >
      Keep a copy on this device.
    </Tooltip>
  );
}
