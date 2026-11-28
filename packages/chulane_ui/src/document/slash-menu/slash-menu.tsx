/** slash menu presentation and interaction contract. */
import type { SlashMenuProps } from "./types.js";
import { CommandListView } from "../../commands/command-list-view.js";

export type { SlashMenuProps } from "./types.js";
/** Filter block types and return focus to the editor on insertion or Escape. */
export function SlashMenu({ commands, onClose }: SlashMenuProps) {
  const menu = "cu-menu";
  return (
    <section
      aria-label="Insert a block"
      className={menu}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          onClose();
        }
      }}
    >
      <CommandListView
        autoFocus
        commands={commands}
        label="Find block type"
        onSelect={(c) => {
          c.run();
          onClose();
        }}
      />
    </section>
  );
}
