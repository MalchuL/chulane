/** Demonstrates shared pointer timing for nearby icon actions. */
import { useState } from "react";
import { ButtonGroup, IconButton, ThemeScope, TooltipProvider } from "@chulane/ui";
import { Pin, Star } from "lucide-react";

/**
 * Demonstrates shared timing and an opt-in hoverable tooltip for page actions.
 * @returns Two toggles with pointer and keyboard tooltips.
 */
export default function Example() {
  const [selected, setSelected] = useState(false);
  const [pinned, setPinned] = useState(false);
  return (
    <TooltipProvider delayDuration={600} skipDelayDuration={500}>
      <ThemeScope>
        <ButtonGroup label="Page actions">
          <IconButton
            label="Favorite page"
            aria-pressed={selected}
            onClick={() => setSelected(!selected)}
          >
            <Star aria-hidden />
          </IconButton>
          <IconButton
            label="Pin page"
            aria-pressed={pinned}
            onClick={() => setPinned(!pinned)}
            tooltipHoverable
          >
            <Pin aria-hidden />
          </IconButton>
        </ButtonGroup>
      </ThemeScope>
    </TooltipProvider>
  );
}
