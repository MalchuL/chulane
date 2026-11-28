/** command palette presentation and interaction contract. */
import type { CommandPaletteProps } from "./types.js";
import { useState } from "react";
import { Dialog, DialogTrigger, DialogTitle, DialogOverlay } from "../../components/ui/dialog.js";
import { Dialog as Primitive } from "radix-ui";
import { usePortalHost } from "../../foundation/theme-scope/hooks.js";
import { CommandListView } from "../command-list-view.js";

export type { CommandPaletteProps } from "./types.js";
/**
 * Search existing actions and run a result with the keyboard.
 * @param props Presentation values and host callbacks described by the public props type.
 * @returns The rendered CommandPalette view.
 */
export function CommandPalette({ commands, trigger, open, onOpenChange }: CommandPaletteProps) {
  const host = usePortalHost();
  const [local, setLocal] = useState(false);
  const dialogClassName = "cu-dialog cu-command-dialog";
  function change(value: boolean) {
    setLocal(value);
    onOpenChange?.(value);
  }
  return (
    <Dialog open={open ?? local} onOpenChange={change}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <Primitive.Portal container={host}>
        <DialogOverlay className="cu-overlay" />
        <Primitive.Content
          data-slot="dialog-content"
          className={dialogClassName}
          aria-describedby={undefined}
        >
          <DialogTitle className="sr-only">Command palette</DialogTitle>
          <CommandListView
            commands={commands}
            label="Search commands"
            onSelect={(c) => {
              change(false);
              c.run();
            }}
          />
        </Primitive.Content>
      </Primitive.Portal>
    </Dialog>
  );
}
