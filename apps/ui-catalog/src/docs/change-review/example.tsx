/** Three proposals share a reviewed count and retain independently accessible previews. */
import { useState } from "react";
import { ChangeReview } from "@chulane/ui";
import type { ChangeStatus, ProposedChange } from "@chulane/ui";

/**
 * Demonstrates reviewing and undoing changes with host-owned fixture state.
 * @returns An interactive proposal list.
 */
export default function Example() {
  const [changes, setChanges] = useState<ProposedChange[]>([
    {
      id: "intro",
      summary: "Rewrite introduction",
      target: { label: "Cats" },
      status: "pending",
      before: "The domestic cat is a small carnivorous mammal descended from the African wildcat.",
      after: "Domestic cats are small carnivorous mammals that evolved from African wildcats.",
    },
    {
      id: "dogs",
      summary: "Improve dog care",
      target: { label: "Dogs" },
      status: "applied",
      before: "Walk daily.",
      after: "Offer daily walks and enrichment.",
    },
    {
      id: "snakes",
      summary: "Improve snake care",
      target: { label: "Snakes" },
      status: "applied",
      before: "Check the enclosure.",
      after: "Check the enclosure temperature each morning.",
    },
  ]);

  /**
   * Updates the status of the one proposal named by a review action.
   * @param id The proposal identifier reported by the component.
   * @param status The next host-owned status.
   * @returns Nothing. The fixture state is updated for the next render.
   */
  function update(id: string, status: ChangeStatus) {
    setChanges((rows) => rows.map((row) => (row.id === id ? { ...row, status } : row)));
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
