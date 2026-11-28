/** Scrollable Chulane surface with independently selectable scrollbar axes. */
import { cn } from "cn";
import { ScrollArea as Primitive } from "radix-ui";
import { ScrollBar } from "../../components/ui/scroll-area.js";
import type { ScrollAreaProps } from "./types.js";

/**
 * Provide a bounded viewport with native scrolling and themed scrollbars.
 *
 * The host supplies the content and constrains the root’s dimensions. ScrollArea
 * renders scrollbars for the requested axes and leaves scrolling to the browser.
 * @param props Root attributes, scrollable content, and scrollbar orientation.
 * @returns A scroll area root containing the viewport and its scrollbar controls.
 * @example
 * <ScrollArea className="notebook"><NotebookEntries /></ScrollArea>
 */
export function ScrollArea({
  className,
  children,
  orientation = "vertical",
  ...rest
}: ScrollAreaProps) {
  const rootClassName = "cu-scroll-area";
  const viewportClassName = "cu-scroll-viewport";
  return (
    <Primitive.Root {...rest} data-slot="scroll-area" className={cn(rootClassName, className)}>
      <Primitive.Viewport data-slot="scroll-area-viewport" className={viewportClassName}>
        {children}
      </Primitive.Viewport>
      {orientation !== "horizontal" && <ScrollBar />}
      {orientation !== "vertical" && <ScrollBar orientation="horizontal" />}
      <Primitive.Corner />
    </Primitive.Root>
  );
}
