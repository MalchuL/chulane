/** Coordinates the dialog's default focus behavior with Radix and host callbacks. */
import { useRef } from "react";
import type { DialogProps } from "./types.js";

/**
 * Focus the requested element or heading and remember the opener for triggerless dialogs.
 * @param initialFocus The host's optional focus target.
 * @param hasTrigger Whether Radix already has a trigger to restore focus to.
 * @param onOpenAutoFocus Host callback that can override the opening focus behavior.
 * @param onCloseAutoFocus Host callback that can override the closing focus behavior.
 * @returns The heading ref and Radix autofocus handlers.
 */
export function useDialogFocus(
  initialFocus: DialogProps["initialFocus"],
  hasTrigger: boolean,
  onOpenAutoFocus: DialogProps["onOpenAutoFocus"],
  onCloseAutoFocus: DialogProps["onCloseAutoFocus"],
) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  return {
    titleRef,
    /** Records the opener and moves focus unless the host overrides it. */
    onOpenAutoFocus(event: Event) {
      const activeElement = titleRef.current?.ownerDocument.activeElement;
      opener.current = activeElement instanceof HTMLElement ? activeElement : null;
      onOpenAutoFocus?.(event);
      const target = initialFocus?.current ?? titleRef.current;
      if (!event.defaultPrevented && target) {
        event.preventDefault();
        target.focus();
      }
    },
    /** Restores focus to the opener of a triggerless modal unless the host overrides it. */
    onCloseAutoFocus(event: Event) {
      onCloseAutoFocus?.(event);
      if (!event.defaultPrevented && !hasTrigger && opener.current?.isConnected) {
        event.preventDefault();
        opener.current.focus();
      }
    },
  };
}
