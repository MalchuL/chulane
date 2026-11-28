/** dialog presentation and interaction contract. */
import { usePortalHost } from "../theme-scope/hooks.js";
import { Dialog as Primitive } from "radix-ui";
import { useRef } from "react";
import { ScrollArea } from "../../components/ui/scroll-area.js";
import type { DialogProps } from "./types.js";
import * as UI from "../../components/ui/dialog.js";
import { X } from "lucide-react";
import { IconButton } from "../icon-button/icon-button.js";

export type { DialogProps } from "./types.js";

/**
 * Open a focused task with keyboard focus contained and restored.
 * @param props Presentation values and host callbacks described by the public props type.
 * @returns The rendered Dialog view.
 */
export function Dialog({
  initialFocus,
  title,
  description,
  trigger,
  children,
  open,
  onOpenChange,
}: DialogProps) {
  const host = usePortalHost();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const dialogClassName = "cu-dialog";
  const rowClassName = "cu-row";
  const spacerClassName = "cu-spacer";
  return (
    <UI.Dialog open={open} onOpenChange={onOpenChange}>
      {trigger && <UI.DialogTrigger asChild>{trigger}</UI.DialogTrigger>}

      <Primitive.Portal container={host}>
        <UI.DialogOverlay className="cu-overlay" />
        <Primitive.Content
          data-slot="dialog-content"

          onOpenAutoFocus={(e) => {
            opener.current =
              document.activeElement instanceof HTMLElement ? document.activeElement : null;
            const target = initialFocus?.current ?? titleRef.current;
            if (target) {
              e.preventDefault();
              target.focus();
            }
          }}
          onCloseAutoFocus={(event) => {
            if (!trigger && opener.current?.isConnected) {
              event.preventDefault();
              opener.current.focus();
            }
          }}
          className={dialogClassName}
          {...(!description && { "aria-describedby": undefined })}
        >
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
          {description && <UI.DialogDescription>{description}</UI.DialogDescription>}
          <ScrollArea className="cu-scroll-overlay">{children}</ScrollArea>
        </Primitive.Content>
      </Primitive.Portal>
    </UI.Dialog>
  );
}
