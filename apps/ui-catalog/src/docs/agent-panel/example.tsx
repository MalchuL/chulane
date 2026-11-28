/** Composes the panel from a controlled transcript, history and bottom composer. */
import { History } from "lucide-react";
import { useState } from "react";
import { AgentComposer, AgentPanel, AgentMessage } from "@chulane/ui";
import type { AgentDraft, ContextItem } from "@chulane/ui";

const contexts: ContextItem[] = [
  { id: "field-notes", label: "Field notes", kind: "page" },
  { id: "opening", label: "Opening paragraph", kind: "block" },
  { id: "atlas", label: "Atlas research", kind: "project" },
  { id: "notes-file", label: "notes.txt", kind: "attachment" },
];

/** Render a local conversation with history and a context-aware composer. */
export default function Example() {
  const agentPreviewClassName = "catalog-agent-preview";
  const [messages, setMessages] = useState([
    { id: "welcome", text: "Welcome to the research workspace." },
  ]);
  const [draft, setDraft] = useState<AgentDraft>({
    text: "",
    context: contexts.slice(0, 2),
    mode: "Suggest",
    model: "Device default",
  });
  const [history, setHistory] = useState(false);
  return (
    <div className={agentPreviewClassName}>
      <AgentPanel
        title="Workspace agent"
        onNew={() => setMessages([])}
        menu={[
          {
            id: "history",
            label: "Conversation history",
            icon: History,
            checked: history,
            onSelect: () => setHistory(!history),
          },
        ]}
        selector={history && <p>Current conversation · {messages.length} messages</p>}
        composer={
          <AgentComposer
            draft={draft}
            onDraftChange={setDraft}
            availableContext={contexts}
            modes={["Ask", "Suggest", "Edit", "Agent"]}
            models={[{ label: "Device default", location: "device" }]}
            onSend={() => {
              setMessages([...messages, { id: crypto.randomUUID(), text: draft.text }]);
              setDraft({ ...draft, text: "" });
            }}
            onStop={() => {}}
          />
        }
      >
        {messages.map(renderMessage)}
      </AgentPanel>
    </div>
  );
}

/** Render the initial welcome without a visible author and local replies on the user side. */
function renderMessage({ text, id }: { text: string; id: string }) {
  const welcome = id === "welcome";
  return (
    <AgentMessage
      key={id}
      messageId={id}
      side={welcome ? "assistant" : "user"}
      author={welcome ? "Workspace agent" : "You"}
      hideAuthor={welcome}
    >
      {text}
    </AgentMessage>
  );
}
