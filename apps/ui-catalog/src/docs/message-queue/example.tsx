/** Live MessageQueue usage, also displayed as source in the catalog. */
import { useState } from "react";
import { MessageQueue } from "chulane_ui";
const reference = { id: "field", label: "Field notes", href: "#field-notes" };

export default function Example() {
  const [items, setItems] = useState([
    {
      id: "q1",
      draft: {
        text: "Compare the two revisions.",
        context: [reference],
        mode: "Ask",
        model: "Local",
      },
    },
  ]);
  return (
    <MessageQueue
      items={items}
      onEdit={(id, text) =>
        setItems(items.map((i) => (i.id === id ? { ...i, draft: { ...i.draft, text } } : i)))
      }
      onRemove={(id) => setItems(items.filter((i) => i.id !== id))}
    />
  );
}
