/** Live Popover usage, also displayed as source in the catalog. */
import { Button, Popover } from "@chulane/ui";

export default function Example() {
  return (
    <Popover label="Page details" trigger={<Button variant="outline">Page details</Button>}>
      <p>Collection · Research</p>
    </Popover>
  );
}
