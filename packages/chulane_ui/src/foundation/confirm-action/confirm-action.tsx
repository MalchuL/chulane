/** Renders a destructive confirmation in the nearest theme scope. */
import { cn } from "cn";
import { AlertDialog as Primitive } from "radix-ui";
import * as UI from "../../components/ui/alert-dialog.js";
import { ScrollArea } from "../../components/ui/scroll-area.js";
import { usePortalHost } from "../theme-scope/hooks.js";
import type { ConfirmActionProps } from "./types.js";

/**
 * Ask for explicit confirmation of a destructive action.
 *
 * The host owns the operation and can control visibility. Radix focuses the safe
 * action first and closes the dialog when the user confirms or cancels.
 *
 * @param props Confirmation text, action callbacks, open state and panel attributes.
 * @returns The optional trigger and portaled alert dialog.
 * @example
 * <ConfirmAction
 *   title="Remove attachment?"
 *   description="This removes the attachment from the page."
 *   confirmLabel="Remove"
 *   trigger={<button>Remove attachment</button>}
 *   onConfirm={removeAttachment}
 * />
 */
export function ConfirmAction({
  trigger,
  open,
  defaultOpen,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  onConfirm,
  className,
  ...rest
}: ConfirmActionProps) {
  const host = usePortalHost();
  const dialogClassName = "cu-dialog";
  const scrollClassName = "cu-scroll-overlay";
  const actionsClassName = "cu-confirm-actions";
  const overlayClassName = "cu-overlay";

  return (
    <UI.AlertDialog open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
      {trigger && <UI.AlertDialogTrigger asChild>{trigger}</UI.AlertDialogTrigger>}

      <Primitive.Portal container={host}>
        <UI.AlertDialogOverlay className={overlayClassName} />
        <Primitive.Content
          data-slot="alert-dialog-content"
          {...rest}
          className={cn(dialogClassName, className)}
        >
          <UI.AlertDialogTitle>{title}</UI.AlertDialogTitle>
          <ScrollArea className={scrollClassName}>
            <UI.AlertDialogDescription>{description}</UI.AlertDialogDescription>
          </ScrollArea>
          <div role="group" aria-label="Confirmation actions" className={actionsClassName}>
            <UI.AlertDialogCancel>{cancelLabel}</UI.AlertDialogCancel>
            <UI.AlertDialogAction variant="destructive" onClick={onConfirm}>
              {confirmLabel}
            </UI.AlertDialogAction>
          </div>
        </Primitive.Content>
      </Primitive.Portal>
    </UI.AlertDialog>
  );
}
