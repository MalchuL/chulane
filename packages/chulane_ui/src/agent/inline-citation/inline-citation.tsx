/** Focusable source link with a preview scoped to the surrounding theme. */
import { usePortalHost } from "../../foundation/theme-scope/hooks.js";
import { HoverCard as Primitive } from "radix-ui";
import { HoverCard, HoverCardTrigger } from "../../components/ui/hover-card.js";
import type { InlineCitationProps } from "./types.js";
export type { InlineCitationProps } from "./types.js";
/** Show the source label inline and reveal its destination on hover or keyboard focus. */
export function InlineCitation({ source }: InlineCitationProps) {
  const host = usePortalHost();
  return (
    <HoverCard>
      <HoverCardTrigger asChild>
        <a href={source.href}>{source.label}</a>
      </HoverCardTrigger>
      <Primitive.Portal container={host}>
        <Primitive.Content data-slot="hover-card-content" className="cu-menu" sideOffset={4}>
          <strong>{source.label}</strong>
          <p>{source.description ?? source.href}</p>
        </Primitive.Content>
      </Primitive.Portal>
    </HoverCard>
  );
}
