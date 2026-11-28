/** Live SlashMenu usage, also displayed as source in the catalog. */
import { useState } from "react";
import { Button, SlashMenu } from "chulane_ui";

export default function Example() {
  const [open, setOpen] = useState(true);
  const [block, setBlock] = useState("");
  return (
    <>
      {open ? (
        <SlashMenu
          commands={["Paragraph", "Heading", "Checklist"].map((label) => ({
            id: label,
            label,
            run: () => setBlock(label),
          }))}
          onClose={() => setOpen(false)}
        />
      ) : (
        <Button onClick={() => setOpen(true)}>{block || "Insert block"}</Button>
      )}
    </>
  );
}
