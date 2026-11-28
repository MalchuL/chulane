/** A local chat demonstrates the single composer surface, context and model menus. */
import { useState } from "react";
import { AgentComposer, type AgentDraft, type ContextItem } from "chulane_ui";
import { Sparkles } from "lucide-react";
const context: ContextItem[] = [
  { id: "cats", label: "Cats" },
  { id: "animals", label: "Animal research", kind: "project" },
];
export default function Example() {
  const card = "catalog-composer-example";
  const empty = "cu-agent-empty";
  const row = "cu-row";
  const [draft, setDraft] = useState<AgentDraft>({
    text: "",
    context: [context[0]],
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
        onChange={setDraft}
        models={[
          { label: "Device default", location: "device" },
          { label: "Local model", location: "local" },
          { label: "Cloud model", location: "cloud" },
        ]}
        modes={["Ask", "Suggest", "Edit", "Agent"]}
        availableContext={context}
        onAttach={(files) =>
          setDraft((d) => ({
            ...d,
            context: [
              ...d.context,
              ...files.map((f) => ({
                id: crypto.randomUUID(),
                label: f.name,
                kind: "attachment" as const,
              })),
            ],
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
