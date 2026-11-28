/** One editable paragraph supplies native selection and delegates document operations to its host. */
import { useRef, useState } from "react";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Code,
  Link,
  Highlighter,
  Sparkles,
  Copy,
  Repeat2,
  ArrowUpDown,
  Trash2,
  Heading2,
  Pilcrow,
  ListChecks,
  Quote,
  Ellipsis,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import {
  BlockControls,
  SelectionToolbar,
  TextArea,
  SlashMenu,
  ActionMenu,
  IconButton,
  Dialog,
  Button,
  type Command,
} from "chulane_ui";

export type TextBlock = { id: string; text: string };
type Props = {
  block: TextBlock;
  first: boolean;
  last: boolean;
  onText: (value: string) => void;
  onInsert: (text: string) => void;
  onMove: (direction: number) => void;
  onDelete: () => void;
  onDropBlock: (id: string) => void;
};
export function EditableBlock({
  block,
  first,
  last,
  onText,
  onInsert,
  onMove,
  onDelete,
  onDropBlock,
}: Props) {
  const [field, setField] = useState<HTMLTextAreaElement | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState(false);
  const [slash, setSlash] = useState(false);
  const [excerpt, setExcerpt] = useState("");
  const [insertNew, setInsertNew] = useState(false);
  function replace(before: string, after = "") {
    if (!field) {
      return;
    }
    const { selectionStart: start, selectionEnd: end, value } = field;
    onText(value.slice(0, start) + before + value.slice(start, end) + after + value.slice(end));
    field.focus();
    setSelected(false);
    requestAnimationFrame(() =>
      field.setSelectionRange(
        end + before.length + after.length,
        end + before.length + after.length,
      ),
    );
  }
  const kinds = [
    ["Paragraph", "", Pilcrow],
    ["Heading", "## ", Heading2],
    ["Checklist", "- [ ] ", ListChecks],
    ["Quote", "> ", Quote],
  ] as const;
  const insertCommands: Command[] = [];
  for (const [label, prefix, icon] of kinds) {
    insertCommands.push({
      id: label,
      icon,
      label,
      run: () => {
        if (insertNew) {
          onInsert(prefix);
        } else {
          replace(prefix);
        }
      },
    });
  }
  const transform = kinds.map(([label, prefix, icon]) => ({
    id: label,
    icon,
    label,
    run: () => onText(prefix + block.text.replace(/^(## |- \[ \] |> )/, "")),
  }));
  const ask = () => {
    setExcerpt(field?.value.slice(field.selectionStart, field.selectionEnd) || block.text);
  };
  const commands: Command[] = [
    { id: "bold", label: "Bold", icon: Bold, run: () => replace("**", "**") },
    { id: "italic", label: "Italic", icon: Italic, run: () => replace("*", "*") },
    {
      id: "underline",
      label: "Underline",
      icon: Underline,
      run: () => replace("<u>", "</u>"),
    },
    {
      id: "strike",
      label: "Strikethrough",
      icon: Strikethrough,
      run: () => replace("~~", "~~"),
    },
    { id: "code", label: "Code", icon: Code, run: () => replace("`", "`") },
    { id: "link", label: "Link", icon: Link, run: () => replace("[", "](url)") },
    {
      id: "highlight",
      label: "Highlight",
      icon: Highlighter,
      run: () => replace("==", "=="),
    },
    { id: "ask", label: "Ask AI", icon: Sparkles, run: ask },
  ];
  const move = [
    { id: "up", label: "Move up", icon: ArrowUp, disabled: first, run: () => onMove(-1) },
    {
      id: "down",
      label: "Move down",
      icon: ArrowDown,
      disabled: last,
      run: () => onMove(1),
    },
  ];
  const actions = [
    { id: "ask", label: "Ask AI", icon: Sparkles, run: ask },
    { id: "type", label: "Turn into", icon: Repeat2, items: transform },
    { id: "copy", label: "Duplicate block", icon: Copy, run: () => onInsert(block.text) },
    {
      id: "link",
      label: "Copy block link",
      icon: Link,
      run: () => void navigator.clipboard.writeText(location.href.split("#")[0] + "#" + block.id),
    },
    { id: "move", label: "Move", icon: ArrowUpDown, items: move },
    {
      id: "delete",
      label: "Delete block",
      icon: Trash2,
      destructive: true,
      run: onDelete,
    },
  ];
  const draftClass = "catalog-block-host";
  return (
    <div
      ref={host}
      id={block.id}
      className={draftClass}
      onBlur={(e) => {
        if (
          !e.currentTarget.contains(e.relatedTarget) &&
          !e.relatedTarget?.closest('[role="menu"]')
        ) {
          setSelected(false);
        }
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("application/x-chulane-block")) {
          e.preventDefault();
        }
      }}
      onDrop={(e) => {
        const id = e.dataTransfer.getData("application/x-chulane-block");
        if (id) {
          e.preventDefault();
          onDropBlock(id);
        }
      }}
    >
      <BlockControls
        actions={actions}
        onInsert={() => {
          setInsertNew(true);
          setSlash(true);
        }}
        onDragStart={(e) => e.dataTransfer.setData("application/x-chulane-block", block.id)}
      >
        <SelectionToolbar
          visible={selected}
          commands={commands}
          leading={
            <ActionMenu
              label="Text style"
              trigger={
                <IconButton label="Text style">
                  <Heading2 />
                </IconButton>
              }
              items={transform}
            />
          }
          trailing={
            <ActionMenu
              label="More formatting"
              trigger={
                <IconButton label="More formatting">
                  <Ellipsis />
                </IconButton>
              }
              items={[
                {
                  id: "copy",
                  label: "Copy selection",
                  icon: Copy,
                  run: () => {
                    const f = field;
                    if (f) {
                      void navigator.clipboard.writeText(
                        f.value.slice(f.selectionStart, f.selectionEnd),
                      );
                    }
                  },
                },
              ]}
            />
          }
        />
        <TextArea
          ref={setField}
          label={first ? "Document body" : "Document paragraph"}
          rows={2}
          value={block.text}
          onChange={(e) => onText(e.target.value)}
          onSelect={(e) =>
            setSelected(e.currentTarget.selectionStart !== e.currentTarget.selectionEnd)
          }
          onKeyDown={(e) => {
            if (e.key === "/") {
              e.preventDefault();
              setInsertNew(false);
              setSlash(true);
            }
            if (e.altKey && e.key === "F10") {
              e.preventDefault();
              host.current
                ?.querySelector<HTMLButtonElement>(".cu-selection-toolbar button")
                ?.focus();
            }
          }}
        />
      </BlockControls>
      {slash && (
        <SlashMenu
          commands={insertCommands}
          onClose={() => {
            setSlash(false);
            field?.focus();
          }}
        />
      )}
      <Dialog
        title="Ask about this passage"
        open={!!excerpt}
        onOpenChange={(open) => {
          if (!open) {
            setExcerpt("");
          }
        }}
      >
        <blockquote>{excerpt}</blockquote>
        <Button
          onClick={() => {
            sessionStorage.setItem("catalog.agent-question", "Explain this passage: " + excerpt);
            location.assign("/examples/agent-review");
          }}
        >
          Open in workspace agent
        </Button>
      </Dialog>
    </div>
  );
}
