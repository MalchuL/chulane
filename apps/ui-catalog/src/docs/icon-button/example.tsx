/** Live IconButton usage, also displayed as source in the catalog. */
import { useState } from "react";
import { IconButton } from "@chulane/ui";
import { Star } from "lucide-react";

/**
 * Shows an icon toggle with an accessible name and tooltip.
 * @returns A button that toggles the page's favorite state.
 */
export default function Example() {
  const [selected, setSelected] = useState(false);
  return (
    <IconButton
      label="Favorite page"
      aria-pressed={selected}
      onClick={() => setSelected(!selected)}
    >
      <Star aria-hidden />
    </IconButton>
  );
}
