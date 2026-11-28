/** Composes the panel from a controlled transcript, history and bottom composer. */
import { History } from "lucide-react";
import { useState } from "react";
import { AgentPanel, AgentMessage, TextArea, Button } from "chulane_ui";
export default function Example() {
  const agentPreviewClassName = "catalog-agent-preview";
  const [messages, setMessages] = useState([
    { id: "welcome", text: "Welcome to the research workspace." },
  ]);
  const [draft, setDraft] = useState("");
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
            run: () => setHistory(!history),
          },
        ]}
        selector={history && <p>Current conversation · {messages.length} messages</p>}
        composer={
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (draft.trim()) {
                setMessages([...messages, { id: crypto.randomUUID(), text: draft }]);
                setDraft("");
              }
            }}
          >
            <TextArea label="Message" value={draft} onChange={(e) => setDraft(e.target.value)} />
            <Button type="submit" disabled={!draft.trim()}>
              Send
            </Button>
          </form>
        }
      >
        {messages.map(({ text, id }) => (
          <AgentMessage
            key={id}
            messageId={id}
            side={id === "welcome" ? "assistant" : "user"}
            author={text === "Welcome to the research workspace." ? "Workspace agent" : "You"}
          >
            {text}
          </AgentMessage>
        ))}
      </AgentPanel>
    </div>
  );
}
