/** Renders a modal and its scrollable body inside the nearest theme scope. */
import { cn } from "cn";
import { X } from "lucide-react";
import { Dialog as Primitive } from "radix-ui";
import type { ReactNode, RefObject } from "react";
import * as UI from "../../components/ui/dialog.js";
import { ScrollArea } from "../../components/ui/scroll-area.js";
import { IconButton } from "../icon-button/icon-button.js";
import { usePortalHost } from "../theme-scope/hooks.js";
import { useDialogFocus } from "./hooks.js";
import type { DialogProps } from "./types.js";

/**
 * Render the accessible heading and the close control outside the scrollable body.
 * @param props Heading content and its focus reference.
 * @returns The fixed dialog header.
 */
function DialogHeader({
  title,
  titleRef,
}: {
  title: ReactNode;
  titleRef: RefObject<HTMLHeadingElement | null>;
}) {
  const rowClassName = "cu-row";
  const spacerClassName = "cu-spacer";
  return (
    <div className={rowClassName}>
      <UI.DialogTitle ref={titleRef} tabIndex={-1}>
        {title}
      </UI.DialogTitle>
      <span className={spacerClassName} />
      <UI.DialogClose asChild>
        <IconButton label="Close">
          <X />
        </IconButton>
      </UI.DialogClose>
    </div>
  );
}

/**
 * Open a modal for a focused task.
 *
 * The host supplies the content and can control visibility. Radix traps focus and
 * handles dismissal. By default, the dialog focuses its heading and restores focus
 * on dismissal, including when opened without a trigger.
 *
 * @param props Modal content, open state and attributes for the dialog panel.
 * @returns The optional trigger and portaled modal.
 * @example
 * <Dialog title="Recent versions" trigger={<button>History</button>}>
 *   No versions yet.
 * </Dialog>
 */
export function Dialog({
  initialFocus,
  title,
  description,
  trigger,
  children,
  open,
  defaultOpen,
  onOpenChange,
  className,
  onOpenAutoFocus,
  onCloseAutoFocus,
  ...rest
}: DialogProps) {
  const host = usePortalHost();
  const { titleRef, ...focus } = useDialogFocus(
    initialFocus,
    Boolean(trigger),
    onOpenAutoFocus,
    onCloseAutoFocus,
  );
  const dialogClassName = "cu-dialog";
  const overlayClassName = "cu-overlay";
  const scrollClassName = "cu-scroll-overlay";

  return (
    <UI.Dialog open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
      {trigger && <UI.DialogTrigger asChild>{trigger}</UI.DialogTrigger>}
      <Primitive.Portal container={host}>
        <UI.DialogOverlay className={overlayClassName} />
        <Primitive.Content
          data-slot="dialog-content"
          {...(!description && { "aria-describedby": undefined })}
          {...rest}
          {...focus}
          className={cn(dialogClassName, className)}
        >
          <DialogHeader title={title} titleRef={titleRef} />
          {description && <UI.DialogDescription>{description}</UI.DialogDescription>}
          <ScrollArea className={scrollClassName}>{children}</ScrollArea>
        </Primitive.Content>
      </Primitive.Portal>
    </UI.Dialog>
  );
}
