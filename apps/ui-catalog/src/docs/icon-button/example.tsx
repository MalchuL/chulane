/** Live IconButton usage, also displayed as source in the catalog. */
import { useState } from "react";
import { IconButton } from "chulane_ui";
import { Star } from "lucide-react";

export default function Example() {
  const [selected, setSelected] = useState(false);
  return (
    <IconButton
      label="Favorite page"
      aria-pressed={selected}
      onClick={() => setSelected(!selected)}
    >
      <Star />
    </IconButton>
  );
}
