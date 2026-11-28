/** Scrollable Chulane surface with independently selectable scrollbar axes. */
import * as React from "react";
import { cn } from "cn";
import { ScrollArea as ScrollAreaPrimitive } from "radix-ui";

import { ScrollArea as VerticalScrollArea, ScrollBar } from "../../components/ui/scroll-area.js";
export function ScrollArea({
  className,
  children,
  orientation = "vertical",
  ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.Root> & {
  orientation?: "horizontal" | "vertical" | "both";
}) {
  if (orientation === "vertical") {
    return (
      <VerticalScrollArea className={className} {...props}>
        {children}
      </VerticalScrollArea>
    );
  }
  return (
    <ScrollAreaPrimitive.Root
      data-slot="scroll-area"
      className={cn("relative", className)}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        data-slot="scroll-area-viewport"
        className="size-full rounded-[inherit] transition-[color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1"
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      {orientation === "both" && <ScrollBar />}
      <ScrollBar orientation="horizontal" />
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  );
}
