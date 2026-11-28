/** confirm action presentation and interaction contract. */
import { usePortalHost } from "../theme-scope/hooks.js";
import { AlertDialog as Primitive } from "radix-ui";
import type { ConfirmActionProps } from "./types.js";
import { ScrollArea } from "../../components/ui/scroll-area.js";
import * as UI from "../../components/ui/alert-dialog.js";
import { ButtonGroup } from "../button-group/button-group.js";

export type { ConfirmActionProps } from "./types.js";
/**
 * Confirm a consequential operation before invoking the host callback.
 * @param props Presentation values and host callbacks described by the public props type.
 * @returns The rendered ConfirmAction view.
 */
export function ConfirmAction({
  trigger,
  open,
  onOpenChange,
  title,
  description,
  action,
  onConfirm,
}: ConfirmActionProps) {
  const host = usePortalHost();
  const dialogClassName = "cu-dialog";

  return (
    <UI.AlertDialog open={open} onOpenChange={onOpenChange}>
      {trigger && <UI.AlertDialogTrigger asChild>{trigger}</UI.AlertDialogTrigger>}

      <Primitive.Portal container={host}>
        <UI.AlertDialogOverlay className="cu-overlay" />
        <Primitive.Content data-slot="alert-dialog-content" className={dialogClassName}>
          <UI.AlertDialogTitle>{title}</UI.AlertDialogTitle>
          <ScrollArea className="cu-scroll-overlay">
            <UI.AlertDialogDescription>{description}</UI.AlertDialogDescription>
          </ScrollArea>
          <ButtonGroup label="Confirmation actions">
            <UI.AlertDialogCancel>Cancel</UI.AlertDialogCancel>
            <UI.AlertDialogAction variant="destructive" onClick={onConfirm}>
              {action}
            </UI.AlertDialogAction>
          </ButtonGroup>
        </Primitive.Content>
      </Primitive.Portal>
    </UI.AlertDialog>
  );
}
