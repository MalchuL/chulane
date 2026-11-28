/** Live CommandToolbar usage, also displayed as source in the catalog. */
import { useState } from "react";
import { CommandToolbar } from "@chulane/ui";
import { Star } from "lucide-react";

/** Toggle a host-owned favorite with an icon command. */
export default function Example() {
  const [favorite, setFavorite] = useState(false);
  return (
    <CommandToolbar
      label="Page actions"
      commands={[
        {
          id: "star",
          label: "Favorite",
          icon: Star,
          checked: favorite,
          onSelect: () => setFavorite(!favorite),
        },
      ]}
    />
  );
}
