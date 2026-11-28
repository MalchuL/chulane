/** Local conversation fixture exercising approval, queue and streaming lifecycles. */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  DocumentTabs,
  Dialog,
  AgentPanel,
  InlineCitation,
  AgentMessage,
  AgentComposer,
  MessageQueue,
  ChangeReview,
  Checkbox,
  type ContextItem,
  type AgentDraft,
  type QueuedMessage,
  type ProposedChange,
} from "@chulane/ui";
import {
  Settings2,
  ListChecks,
  LoaderCircle,
  MessageCircle,
  Sparkles,
  Copy,
  RefreshCw,
  ThumbsUp,
  ThumbsDown,
} from "lucide-react";
import { reference } from "../fixtures";
const contexts: ContextItem[] = [
  { ...reference, kind: "page" },
  { id: "opening", label: "Opening paragraph", kind: "block" },
  { id: "atlas", label: "Atlas research", kind: "project" },
];
const blank: AgentDraft = {
  text: "",
  mode: "Suggest",
  model: "Device default",
  context: contexts.slice(0, 2),
};
const first: ProposedChange = {
  id: "proposal",
  summary: "Clarify the opening paragraph",
  target: reference,
  status: "pending",
  before: "The team took notes.",
  after: "The field team documented the northern trail.",
};
type Post = {
  id: string;
  author: string;
  text: string;
  status?: "streaming" | "cancelled" | "complete" | "failed";
};
function Thread({
  name,
  running,
  onRunning,
  create,
  onClose,
}: {
  name: string;
  running: boolean;
  onRunning: (name: string, value: boolean) => void;
  create: () => void;
  onClose?: () => void;
}) {
  const emptyClass = "cu-agent-empty";
  const [draft, setDraft] = useState(() => {
    const text = sessionStorage.getItem("catalog.agent-question");
    return { ...blank, text: text ?? "" };
  });
  useEffect(() => {
    sessionStorage.removeItem("catalog.agent-question");
  }, []);
  const [queue, setQueue] = useState<QueuedMessage[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [changes, setChanges] = useState<ProposedChange[]>([
    first,
    {
      ...first,
      id: "route",
      summary: "Update route description",
      status: "applied",
      before: "Head north.",
      after: "Follow the northern ridge.",
    },
    {
      ...first,
      id: "season",
      summary: "Add seasonal context",
      status: "applied",
      before: "Early in the day.",
      after: "At sunrise in late November.",
    },
  ]);
  function changeStatus(id: string, status: ProposedChange["status"], error?: string) {
    setChanges((current) => current.map((c) => (c.id === id ? { ...c, status, error } : c)));
  }
  const [fail, setFail] = useState(false);
  const settingsCheckbox = useRef<HTMLButtonElement>(null);
  const [settings, setSettings] = useState(false);
  const [feedback, setFeedback] = useState<"up" | "down" | null>(null);
  const [review, setReview] = useState(true);
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const approvals = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useEffect(
    () => () => {
      clearInterval(timer.current);
      for (const timeout of approvals.current.values()) {
        clearTimeout(timeout);
      }
    },
    [],
  );
  const send = useCallback(
    (value: AgentDraft) => {
      clearInterval(timer.current);
      const id = crypto.randomUUID();
      const words = (
        "I reviewed " +
        (value.context.map((c) => c.label).join(", ") || "the workspace") +
        ". The trail observations are ready for review."
      ).split(" ");
      let count = 0;
      onRunning(name, true);
      setPosts((prev) => [
        ...prev,
        { id: crypto.randomUUID(), author: "You", text: value.text },
        { id, author: "Workspace agent", text: "", status: "streaming" },
      ]);
      timer.current = setInterval(() => {
        count++;
        const text = words.slice(0, count).join(" ");
        const done = count >= words.length;
        setPosts((prev) =>
          prev.map((p) =>
            p.id === id ? { ...p, text, status: done ? "complete" : "streaming" } : p,
          ),
        );
        if (done) {
          clearInterval(timer.current);
          onRunning(name, false);
        }
      }, 150);
    },
    [name, onRunning],
  );
  useEffect(() => {
    const next = queue[0];
    if (running || !next || next.id === editingId) {
      return;
    }
    // Scheduling after commit lets a pending edit or unmount cancel delivery.
    const delivery = setTimeout(() => {
      setQueue((items) => items.filter((item) => item.id !== next.id));
      send(next.draft);
    }, 0);
    return () => clearTimeout(delivery);
  }, [running, editingId, queue, send]);
  function stop() {
    clearInterval(timer.current);
    onRunning(name, false);
    setPosts((prev) =>
      prev.map((p) => (p.status === "streaming" ? { ...p, status: "cancelled" } : p)),
    );
  }
  function apply(id: string) {
    changeStatus(id, "applying");
    const failed = fail;
    setFail(false);
    approvals.current.set(
      id,
      setTimeout(() => {
        approvals.current.delete(id);
        changeStatus(
          id,
          failed ? "failed" : "applied",
          failed ? "The page changed. Review and retry." : undefined,
        );
      }, 350),
    );
  }
  return (
    <AgentPanel
      title="Workspace agent"
      onNew={create}
      onClose={onClose}
      menu={[
        {
          id: "settings",
          label: "Agent settings",
          icon: Settings2,
          onSelect: () => setSettings(!settings),
        },
        {
          id: "review",
          label: "Review changes",
          icon: ListChecks,
          checked: review,
          onSelect: () => setReview(!review),
        },
      ]}
      selector={
        <Dialog
          initialFocus={settingsCheckbox}
          title="Agent settings"
          open={settings}
          onOpenChange={setSettings}
        >
          <Checkbox
            controlProps={{ ref: settingsCheckbox }}
            label="Fail next approval"
            checked={fail}
            onCheckedChange={(value) => setFail(value === true)}
          />
        </Dialog>
      }
      queue={
        <MessageQueue
          items={queue}
          onEditingChange={setEditingId}
          onEdit={(id, text) =>
            setQueue(queue.map((q) => (q.id === id ? { ...q, draft: { ...q.draft, text } } : q)))
          }
          onRemove={(id) => setQueue(queue.filter((q) => q.id !== id))}
          onSteer={(id) => {
            const item = queue.find((q) => q.id === id);
            if (item) {
              stop();
              send(item.draft);
              setQueue(queue.filter((q) => q.id !== id));
            }
          }}
        />
      }
      composer={
        <AgentComposer
          draft={draft}
          onDraftChange={setDraft}
          models={[
            { label: "Device default", location: "device" },
            { label: "Local", location: "local" },
            { label: "Cloud", location: "cloud" },
          ]}
          modes={["Ask", "Suggest", "Edit", "Agent"]}
          availableContext={contexts}
          onAttach={(files) =>
            setDraft((value) => ({
              ...value,
              context: [
                ...value.context,
                ...files.map((file) => ({
                  id: crypto.randomUUID(),
                  label: file.name,
                  kind: "attachment" as const,
                })),
              ],
            }))
          }
          streaming={running}
          onSend={() => {
            send(draft);
            setDraft({ ...draft, text: "" });
          }}
          onStop={stop}
          onQueue={() => {
            setQueue([...queue, { id: crypto.randomUUID(), draft }]);
            setDraft({ ...draft, text: "" });
          }}
        />
      }
    >
      {name === "Trail review" ? (
        <AgentMessage
          messageId="trail-overview"
          author="Workspace agent"
          hideAuthor
          actions={[
            {
              id: "copy",
              label: "Copy response",
              icon: Copy,
              onSelect: () =>
                void navigator.clipboard.writeText(
                  changes.map((c) => c.summary + " · " + c.target.label).join("\n"),
                ),
            },
            {
              id: "again",
              label: "Review again",
              icon: RefreshCw,
              disabled: running,
              onSelect: () => send({ ...blank, text: "Review the changes to Field notes again." }),
            },
            {
              id: "up",
              label: "Helpful",
              icon: ThumbsUp,
              checked: feedback === "up",
              onSelect: () => setFeedback(feedback === "up" ? null : "up"),
            },
            {
              id: "down",
              label: "Unhelpful",
              icon: ThumbsDown,
              checked: feedback === "down",
              onSelect: () => setFeedback(feedback === "down" ? null : "down"),
            },
          ]}
          references={[reference]}
          activity={[
            {
              id: "read",
              kind: "tool",
              title: "Read Field notes",
              detail: "Read the selected page",
            },
            { id: "compare", kind: "reasoning", title: "Compared two paragraphs" },
          ]}
        >
          <p>
            I found three improvements for <InlineCitation source={reference} />.
          </p>
          {review && (
            <ChangeReview
              changes={changes}
              onApply={apply}
              onDismiss={(id) => changeStatus(id, "dismissed")}
              onUndo={(id) => changeStatus(id, "pending")}
            />
          )}
        </AgentMessage>
      ) : (
        !posts.length && (
          <div className={emptyClass}>
            <Sparkles />
            <p>How can I help with your workspace?</p>
          </div>
        )
      )}
      {posts.map((p) => (
        <AgentMessage
          key={p.id}
          messageId={p.id}
          side={p.author === "You" ? "user" : "assistant"}
          author={p.author}
          hideAuthor={p.author === "Workspace agent"}
          status={p.status}
        >
          {p.text}
        </AgentMessage>
      ))}
    </AgentPanel>
  );
}
export function AgentReview({ onClose }: { onClose?: () => void }) {
  const conversationsClassName = "catalog-conversations";
  const threadClassName = "catalog-thread";

  const [threads, setThreads] = useState([{ name: "Trail review", running: false }]);
  const names = threads.map((thread) => thread.name);
  const onRunning = useCallback((name: string, running: boolean) => {
    setThreads((current) =>
      current.map((thread) => (thread.name === name ? { ...thread, running } : thread)),
    );
  }, []);
  const [active, setActive] = useState(names[0]);
  const next = useRef(2);
  function create() {
    const name = "Conversation " + next.current++;
    setThreads((current) => [...current, { name, running: false }]);
    setActive(name);
  }
  function close(id: string) {
    const remaining = names.filter((n) => n !== id);
    const fallback = remaining[0] ?? "Conversation " + next.current++;
    setThreads((current) =>
      remaining.length
        ? current.filter((t) => t.name !== id)
        : [{ name: fallback, running: false }],
    );
    if (active === id) {
      setActive(fallback);
    }
  }
  function move(id: string, target: string) {
    setThreads((current) => {
      const moved = current.find((t) => t.name === id);
      const index = current.findIndex((t) => t.name === target);
      if (!moved || index < 0) {
        return current;
      }
      const rest = current.filter((t) => t !== moved);
      rest.splice(index, 0, moved);
      return rest;
    });
  }
  return (
    <div className={conversationsClassName}>
      <DocumentTabs
        label="Open conversations"
        tabs={threads.map(({ name, running }) => ({
          id: name,
          title: name,
          icon: running ? LoaderCircle : MessageCircle,
          description: running ? "Generating a response" : "Idle conversation",
        }))}
        value={active}
        onValueChange={setActive}
        onClose={close}
        onMove={move}
      />
      {threads.map(({ name: n, running }) => (
        <div key={n} className={threadClassName} hidden={active !== n}>
          <Thread
            name={n}
            running={running}
            onRunning={onRunning}
            create={create}
            onClose={onClose}
          />
        </div>
      ))}
    </div>
  );
}
