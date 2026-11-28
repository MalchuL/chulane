/** Live Dialog usage, also displayed as source in the catalog. */
import { Button, Badge, Dialog } from "chulane_ui";

export default function Example() {
  return (
    <Dialog
      title="Page properties"
      description="Metadata for Field notes"
      trigger={<Button>Show properties</Button>}
    >
      <Badge>Research</Badge>
    </Dialog>
  );
}
