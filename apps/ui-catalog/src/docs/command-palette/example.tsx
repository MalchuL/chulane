/** Live CommandPalette usage, also displayed as source in the catalog. */
import { useState } from "react";
import { Button, CommandPalette } from "chulane_ui";

export default function Example() {
  const toolbarClassName = "cu-toolbar";
  const [last, setLast] = useState("");
  return (
    <div className={toolbarClassName}>
      <CommandPalette
        trigger={<Button>Find a command</Button>}
        commands={["Search workspace", "Create page", "Toggle navigation"].map((label) => ({
          id: label,
          label,
          group: "Workspace",
          run: () => setLast(label),
        }))}
      />
      <output>{last}</output>
    </div>
  );
}
