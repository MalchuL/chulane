/** Live ContextMenu example for the reference page. */
import { ContextMenu } from "@chulane/ui";
/** Attach a copy action to a keyboard-focusable paragraph wrapper. */
export default function Example() {
  return (
    <ContextMenu
      label="Field notes actions"
      items={[
        {
          id: "copy",
          label: "Copy page title",
          onSelect: () => void navigator.clipboard.writeText("Field notes"),
        },
      ]}
    >
      <p>Field notes</p>
    </ContextMenu>
  );
}
