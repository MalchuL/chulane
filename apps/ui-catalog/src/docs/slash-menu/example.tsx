/** Demonstrates host-controlled search, selection and dismissal in a slash menu. */
import { useRef, useState } from "react";
import { Button, SlashMenu } from "@chulane/ui";
import type { SlashMenuOption } from "@chulane/ui";

const options: readonly SlashMenuOption[] = [
  { id: "paragraph", label: "Paragraph" },
  { id: "heading", label: "Heading" },
  { id: "checklist", label: "Checklist" },
];

/** Render a searchable block picker and show the last chosen type when it closes. */
export default function Example() {
  const [open, setOpen] = useState(true);
  const [query, setQuery] = useState("");
  const [block, setBlock] = useState("");
  const reopenButton = useRef<HTMLButtonElement>(null);

  /** Reset the query and focus the reopening button after it mounts. */
  function closeMenu() {
    setOpen(false);
    setQuery("");
    requestAnimationFrame(() => reopenButton.current?.focus());
  }

  return open ? (
    <SlashMenu
      options={options}
      query={query}
      onQueryChange={setQuery}
      onSelect={(id) => {
        setBlock(options.find((option) => option.id === id)?.label ?? "");
        closeMenu();
      }}
      onClose={closeMenu}
    />
  ) : (
    <Button ref={reopenButton} onClick={() => setOpen(true)}>
      {block || "Insert block"}
    </Button>
  );
}
