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
} from "@chulane/ui";
import type { Command, SlashMenuOption } from "@chulane/ui";

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
  const [slashQuery, setSlashQuery] = useState("");
  const [blockMenuOpen, setBlockMenuOpen] = useState(false);
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
  const insertOptions: SlashMenuOption[] = kinds.map(([label, , icon]) => ({
    id: label,
    icon,
    label,
  }));

  /** Dismiss the picker, clear its search and return focus to the editor. */
  function closeSlashMenu() {
    setSlash(false);
    setSlashQuery("");
    field?.focus();
  }

  /**
   * Apply the chosen block type to the current paragraph or insert it beside the paragraph.
   * @param id Identifier of an option in the block picker.
   */
  function selectBlockType(id: string) {
    const kind = kinds.find(([label]) => label === id);
    if (!kind) {
      return;
    }
    const [, prefix] = kind;
    if (insertNew) {
      onInsert(prefix);
    } else {
      replace(prefix);
    }
    closeSlashMenu();
  }

  const transform = kinds.map(([label, prefix, icon]) => ({
    id: label,
    icon,
    label,
    onSelect: () => onText(prefix + block.text.replace(/^(## |- \[ \] |> )/, "")),
  }));
  const ask = () => {
    setExcerpt(field?.value.slice(field.selectionStart, field.selectionEnd) || block.text);
  };
  const commands: Command[] = [
    { id: "bold", label: "Bold", icon: Bold, onSelect: () => replace("**", "**") },
    { id: "italic", label: "Italic", icon: Italic, onSelect: () => replace("*", "*") },
    {
      id: "underline",
      label: "Underline",
      icon: Underline,
      onSelect: () => replace("<u>", "</u>"),
    },
    {
      id: "strike",
      label: "Strikethrough",
      icon: Strikethrough,
      onSelect: () => replace("~~", "~~"),
    },
    { id: "code", label: "Code", icon: Code, onSelect: () => replace("`", "`") },
    { id: "link", label: "Link", icon: Link, onSelect: () => replace("[", "](url)") },
    {
      id: "highlight",
      label: "Highlight",
      icon: Highlighter,
      onSelect: () => replace("==", "=="),
    },
    { id: "ask", label: "Ask AI", icon: Sparkles, onSelect: ask },
  ];
  const move = [
    { id: "up", label: "Move up", icon: ArrowUp, disabled: first, onSelect: () => onMove(-1) },
    {
      id: "down",
      label: "Move down",
      icon: ArrowDown,
      disabled: last,
      onSelect: () => onMove(1),
    },
  ];
  const actions = [
    { id: "ask", label: "Ask AI", icon: Sparkles, onSelect: ask },
    { id: "type", label: "Turn into", icon: Repeat2, items: transform },
    { id: "copy", label: "Duplicate block", icon: Copy, onSelect: () => onInsert(block.text) },
    {
      id: "link",
      label: "Copy block link",
      icon: Link,
      onSelect: () => void navigator.clipboard.writeText(location.href.split("#")[0] + "#" + block.id),
    },
    { id: "move", label: "Move", icon: ArrowUpDown, items: move },
    {
      id: "delete",
      label: "Delete block",
      icon: Trash2,
      destructive: true,
      onSelect: onDelete,
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
        open={blockMenuOpen}
        onOpenChange={setBlockMenuOpen}
        onInsert={() => {
          setInsertNew(true);
          setSlash(true);
        }}
        onHandleDragStart={(e) => e.dataTransfer.setData("application/x-chulane-block", block.id)}
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
                  onSelect: () => {
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
          onValueChange={onText}
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
          options={insertOptions}
          query={slashQuery}
          onQueryChange={setSlashQuery}
          onSelect={selectBlockType}
          onClose={closeSlashMenu}
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
