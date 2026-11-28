/** A local chat demonstrates the single composer surface, context and model menus. */
import { useState } from "react";
import { AgentComposer } from "@chulane/ui";
import type { AgentDraft, ContextItem } from "@chulane/ui";
import { Sparkles } from "lucide-react";
const context: ContextItem[] = [
  { id: "field-notes", label: "Field notes", kind: "page" },
  { id: "opening", label: "Opening paragraph", kind: "block" },
  { id: "atlas", label: "Atlas research", kind: "project" },
];

/** Render the composer with a draft, selectable context and a local send preview. */
export default function Example() {
  const card = "catalog-composer-example";
  const empty = "cu-agent-empty";
  const row = "cu-row";
  const [draft, setDraft] = useState<AgentDraft>({
    text: "",
    context: context.slice(0, 2),
    mode: "Suggest",
    model: "Device default",
  });
  const [sent, setSent] = useState("");
  return (
    <section className={card}>
      <header className={row}>
        <Sparkles />
        <strong>Workspace agent</strong>
      </header>
      <div className={empty}>
        <Sparkles />
        <p>{sent || "How can I help with your workspace?"}</p>
      </div>
      <AgentComposer
        draft={draft}
        onDraftChange={setDraft}
        models={[
          { label: "Device default", location: "device" },
          { label: "Local model", location: "local" },
          { label: "Cloud model", location: "cloud" },
        ]}
        modes={["Ask", "Suggest", "Edit", "Agent"]}
        availableContext={context}
        onAttach={(files) =>
          setDraft((current) => ({
            ...current,
            context: [...current.context, ...files.map(createAttachmentContext)],
          }))
        }
        onSend={() => {
          setSent(draft.text);
          setDraft({ ...draft, text: "" });
        }}
        onStop={() => {}}
      />
    </section>
  );
}

/** Give a selected file its own draft context identifier and label. */
function createAttachmentContext(file: File): ContextItem {
  return { id: crypto.randomUUID(), label: file.name, kind: "attachment" };
}
