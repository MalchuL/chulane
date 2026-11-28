/** Renders a focusable source link and a preview scoped to the surrounding theme. */
import { HoverCard as Primitive } from "radix-ui";
import { HoverCard, HoverCardTrigger } from "../../components/ui/hover-card.js";
import { usePortalHost } from "../../foundation/theme-scope/hooks.js";
import type { InlineCitationProps } from "./types.js";

/**
 * Displays an inline link and previews its source on hover or keyboard focus.
 *
 * The host supplies the link and any excerpt. The citation owns preview
 * visibility and renders the preview inside the current theme's portal.
 *
 * @param props The source and attributes forwarded to its anchor.
 * @returns A source link with a contextual preview.
 * @example
 * <p>See <InlineCitation source={{ label: "Field notes", href: "/notes/field" }} />.</p>
 */
export function InlineCitation({ source, className, ...rest }: InlineCitationProps) {
  const host = usePortalHost();
  const previewClassName = "cu-menu";
  return (
    <HoverCard>
      <HoverCardTrigger asChild>
        <a {...rest} className={className} href={source.href}>
          {source.label}
        </a>
      </HoverCardTrigger>
      <Primitive.Portal container={host}>
        <Primitive.Content
          data-slot="hover-card-content"
          className={previewClassName}
          sideOffset={4}
        >
          <strong>{source.label}</strong>
          <p>{source.description ?? source.href}</p>
        </Primitive.Content>
      </Primitive.Portal>
    </HoverCard>
  );
}
