/** Live ContextMenu example for the reference page. */
import { ContextMenu } from "chulane_ui";
export default function Example() {
  return (
    <ContextMenu
      label="Field notes actions"
      items={[
        {
          id: "copy",
          label: "Copy page title",
          run: () => void navigator.clipboard.writeText("Field notes"),
        },
      ]}
    >
      <p>Field notes</p>
    </ContextMenu>
  );
}
