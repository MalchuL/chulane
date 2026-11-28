/** Presents the shared searchable command list in a themed, keyboard-accessible dialog. */
import { cn } from "cn";
import { Dialog as Primitive } from "radix-ui";
import { Dialog, DialogTrigger, DialogTitle, DialogOverlay } from "../../components/ui/dialog.js";
import { usePortalHost } from "../../foundation/theme-scope/hooks.js";
import { CommandListView } from "../menu-entries/command-list-view.js";
import type { Command } from "../types.js";
import { usePaletteOpen } from "./hooks.js";
import type { CommandPaletteProps } from "./types.js";

/**
 * Search and select actions through a keyboard-accessible dialog.
 *
 * The host supplies commands and can control visibility. The palette filters enabled
 * commands, requests dismissal on selection, and restores focus to its trigger.
 * @param props Commands, visibility control, optional trigger and dialog attributes.
 * @returns The optional trigger and portaled dialog.
 * @example
 * <CommandPalette
 *   open={open}
 *   onOpenChange={setOpen}
 *   trigger={<button type="button">Find a command</button>}
 *   commands={[{ id: "new", label: "Create page", onSelect: createPage }]}
 * />
 */
export function CommandPalette({
  commands,
  trigger,
  open,
  defaultOpen,
  onOpenChange,
  className,
  ...rest
}: CommandPaletteProps) {
  const host = usePortalHost();
  const [visible, changeOpen] = usePaletteOpen({ open, defaultOpen, onOpenChange });
  const dialogClassName = "cu-dialog cu-command-dialog";
  const overlayClassName = "cu-overlay";
  const titleClassName = "sr-only";

  /**
   * Request dismissal before invoking the selected command's host callback.
   * @param command Selected result.
   * @returns Nothing.
   */
  function selectCommand(command: Command) {
    changeOpen(false);
    command.onSelect();
  }

  return (
    <Dialog open={visible} onOpenChange={changeOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <Primitive.Portal container={host}>
        <DialogOverlay className={overlayClassName} />
        <Primitive.Content
          data-slot="dialog-content"
          className={cn(dialogClassName, className)}
          aria-describedby={undefined}
          {...rest}
        >
          <DialogTitle className={titleClassName}>Command palette</DialogTitle>
          <CommandListView commands={commands} label="Search commands" onSelect={selectCommand} />
        </Primitive.Content>
      </Primitive.Portal>
    </Dialog>
  );
}
