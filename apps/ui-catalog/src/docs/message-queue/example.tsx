/** Live MessageQueue usage, also displayed as source in the catalog. */
import { useState } from "react";
import { Button, ButtonGroup, MessageQueue } from "@chulane/ui";
import type { QueuedMessage } from "@chulane/ui";

const reference = { id: "field", label: "Field notes", href: "#field-notes" };
const sample: QueuedMessage = {
  id: "q1",
  draft: {
    text: "Compare the two revisions.",
    context: [reference],
    mode: "Ask",
    model: "Local",
  },
};

/** Demonstrate host-controlled queue updates and the editing pause reported by the queue. */
export default function Example() {
  const controlsClassName = "flex-wrap";
  const [items, setItems] = useState([sample]);
  const [shown, setShown] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  return (
    <>
      <ButtonGroup label="Queue controls" className={controlsClassName}>
        <Button onClick={() => setItems(items.length ? [] : [sample])}>
          {items.length ? "Clear queue" : "Restore sample"}
        </Button>
        <Button onClick={() => setShown(!shown)}>{shown ? "Hide queue" : "Show queue"}</Button>
      </ButtonGroup>
      <output>{editingId === null ? "Delivery ready" : "Delivery paused while editing"}</output>
      {shown && (
        <MessageQueue
          items={items}
          onEditingChange={setEditingId}
          onEdit={(id, text) =>
            setItems((current) =>
              current.map((item) =>
                item.id === id ? { ...item, draft: { ...item.draft, text } } : item,
              ),
            )
          }
          onRemove={(id) => setItems((current) => current.filter((item) => item.id !== id))}
        />
      )}
    </>
  );
}
