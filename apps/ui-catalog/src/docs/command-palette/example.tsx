/** Live CommandPalette usage, also displayed as source in the catalog. */
import { useState } from "react";
import { Button, CommandPalette } from "@chulane/ui";

/** Open an uncontrolled palette and show the last selected action. */
export default function Example() {
  const toolbarClassName = "cu-toolbar";
  const [last, setLast] = useState("");
  return (
    <div className={toolbarClassName}>
      <CommandPalette
        trigger={<Button>Find a command</Button>}
        commands={[
          ...["Search workspace", "Create page", "Toggle navigation"].map((label) => ({
            id: label,
            label,
            group: "Workspace",
            onSelect: () => setLast(label),
          })),
          {
            id: "archive",
            label: "Archive workspace",
            group: "Workspace",
            disabled: true,
            onSelect: () => setLast("Archive workspace"),
          },
        ]}
      />
      <output>{last}</output>
    </div>
  );
}
