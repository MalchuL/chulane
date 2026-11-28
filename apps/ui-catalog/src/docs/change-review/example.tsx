/** Three proposals share an applied count and retain independently accessible previews. */
import { useState } from "react";
import { ChangeReview, type ProposedChange, type ChangeStatus } from "chulane_ui";
export default function Example() {
  const [changes, setChanges] = useState<ProposedChange[]>([
    {
      id: "intro",
      summary: "Rewrite introduction",
      target: { id: "cats", label: "Cats" },
      status: "pending",
      before: "The domestic cat is a small carnivorous mammal descended from the African wildcat.",
      after: "Domestic cats are small carnivorous mammals that evolved from African wildcats.",
    },
    {
      id: "dogs",
      summary: "Improve dog care",
      target: { id: "dogs", label: "Dogs" },
      status: "applied",
      before: "Walk daily.",
      after: "Offer daily walks and enrichment.",
    },
    {
      id: "snakes",
      summary: "Improve snake care",
      target: { id: "snakes", label: "Snakes" },
      status: "applied",
      before: "Check the enclosure.",
      after: "Check the enclosure temperature each morning.",
    },
  ]);
  function update(id: string, status: ChangeStatus) {
    setChanges((rows) => rows.map((r) => (r.id === id ? { ...r, status } : r)));
  }
  return (
    <ChangeReview
      changes={changes}
      onApply={(id) => update(id, "applied")}
      onDismiss={(id) => update(id, "dismissed")}
      onUndo={(id) => update(id, "pending")}
    />
  );
}
