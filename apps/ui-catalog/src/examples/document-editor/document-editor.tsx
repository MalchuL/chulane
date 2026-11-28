/** Document chrome demonstration, with editing supplied by a local text host. */
import type { TextBlock } from "./editable-block";
import { DocumentBlocks } from "./document-blocks";
import { useState } from "react";
import {
  Copy,
  ListTree,
  X,
  Link,
  Star,
  History,
  MoreHorizontal,
  SplitSquareHorizontal,
  Maximize,
} from "lucide-react";
import {
  DocumentSurface,
  DocumentImage,
  DocumentProperties,
  Breadcrumbs,
  DocumentTabs,
  CommandToolbar,
  ActionMenu,
  IconButton,
  Button,
  Badge,
  Dialog,
  SearchField,
} from "@chulane/ui";
const initialText =
  "The northern trail follows a quiet ridge above the valley. We kept a record of the changing light and the plants along the path.";
export function DocumentEditor() {
  const panelStackClassName = "cu-panel cu-stack";
  const toolbarClassName = "cu-toolbar";
  const spacerClassName = "cu-spacer";
  const metaClassName = "cu-meta";
  const [tabs, setTabs] = useState([
    { id: "notes", title: "Field notes" },
    { id: "atlas", title: "Research atlas" },
  ]);
  const [active, setActive] = useState("notes");
  const [documents, setDocs] = useState<Record<string, TextBlock[]>>({
    notes: [
      { id: "field-notes", text: initialText },
      {
        id: "observations",
        text: "At dusk, the wind dropped and the ridge fell silent.",
      },
    ],
    atlas: [{ id: "research-questions", text: "Research questions and references." }],
  });
  const [tags, setTags] = useState("Fieldwork");
  const [properties, setProperties] = useState(true);
  const [star, setStar] = useState(false);
  const [wide, setWide] = useState(false);
  const [split, setSplit] = useState(false);
  const [links, setLinks] = useState(false);
  const [revisions, setRevisions] = useState<Record<string, string[]>>({});
  const history = revisions[active] ?? [];
  const [showHistory, setShowHistory] = useState(false);
  const documentBlocks = documents[active] ?? [];
  const text = documentBlocks.map((block) => block.text).join("\n\n");
  const title = tabs.find((t) => t.id === active)?.title ?? "Untitled";
  function update(next: TextBlock[]) {
    setDocs({ ...documents, [active]: next });
    setRevisions((previous) => ({
      ...previous,
      [active]: [text, ...(previous[active] ?? [])].slice(0, 10),
    }));
  }
  function duplicate() {
    const id = crypto.randomUUID();
    setDocs({
      ...documents,
      [id]: documentBlocks.map((b) => ({ ...b, id: crypto.randomUUID() })),
    });
    setTabs([...tabs, { id, title: title + " copy" }]);
    setActive(id);
  }
  function close(id: string) {
    const next = tabs.filter((t) => t.id !== id);
    setTabs(next);
    if (active === id) {
      setActive(next[0]?.id ?? "");
    }
  }
  return (
    <div className={panelStackClassName}>
      <DocumentTabs
        tabs={tabs}
        value={active}
        onValueChange={setActive}
        onClose={close}
        onMove={(id, target) => {
          const moving = tabs.find((t) => t.id === id);
          if (!moving) {
            return;
          }
          const rest = tabs.filter((t) => t.id !== id);
          rest.splice(
            tabs.findIndex((t) => t.id === target),
            0,
            moving,
          );
          setTabs(rest);
        }}
      />
      {!tabs.length ? (
        <Button
          onClick={() => {
            setTabs([{ id: "notes", title: "Field notes" }]);
            setActive("notes");
          }}
        >
          Reopen Field notes
        </Button>
      ) : (
        <>
          <div className={toolbarClassName}>
            <Breadcrumbs
              items={[
                { id: "work", label: "Workspace", href: "/examples/knowledge-workspace" },
                { id: active, label: title, href: "#field-notes" },
              ]}
            />
            <span className={spacerClassName} />
            <span className={metaClassName}>In-memory document</span>
            <CommandToolbar
              label="Document toolbar"
              commands={[
                {
                  id: "star",
                  label: "Favorite",
                  icon: Star,
                  checked: star,
                  onSelect: () => setStar(!star),
                },
                {
                  id: "links",
                  label: "Backlinks",
                  icon: Link,
                  onSelect: () => setLinks(!links),
                },
                {
                  id: "history",
                  label: "History",
                  icon: History,
                  onSelect: () => setShowHistory(!showHistory),
                },
                {
                  id: "split",
                  label: "Split document",
                  icon: SplitSquareHorizontal,
                  onSelect: () => setSplit(!split),
                },
                {
                  id: "wide",
                  label: "Full width",
                  icon: Maximize,
                  onSelect: () => setWide(!wide),
                },
              ]}
            />
            <ActionMenu
              label="Page menu"
              trigger={
                <IconButton label="Page menu">
                  <MoreHorizontal />
                </IconButton>
              }
              items={[
                { id: "duplicate", label: "Duplicate", icon: Copy, onSelect: duplicate },
                {
                  id: "properties",
                  label: "Properties",
                  icon: ListTree,
                  checked: properties,
                  onSelect: () => setProperties(!properties),
                },
                {
                  id: "link",
                  label: "Copy link",
                  icon: Link,
                  onSelect: () => void navigator.clipboard.writeText(location.href),
                },
                { id: "trash", label: "Close page", icon: X, onSelect: () => close(active) },
              ]}
            />
          </div>
          <DocumentSurface
            heading={title}
            fullWidth={wide}
            properties={
              properties && (
                <DocumentProperties
                  properties={[
                    { label: "Collection", value: "Research" },
                    {
                      label: "Tags",
                      value: (
                        <Dialog
                          title="Edit tags"
                          trigger={
                            <Button variant="ghost">
                              <Badge>{tags || "Add tag"}</Badge>
                            </Button>
                          }
                        >
                          <SearchField
                            label="Tag name"
                            value={tags}
                            onValueChange={setTags}
                          />
                        </Dialog>
                      ),
                    },
                  ]}
                />
              )
            }
          >
            {links && <a href="/examples/knowledge-workspace">Research atlas · linked page</a>}
            <Dialog title="Recent versions" open={showHistory} onOpenChange={setShowHistory}>
              {history.length ? history.map((v, i) => <p key={i}>{v}</p>) : "No edits yet"}
            </Dialog>
            <DocumentBlocks blocks={documentBlocks} onChange={update} />
            {active === "notes" && (
              <DocumentImage
                src="/field-study.svg"
                alt="Elevation profile of the north ridge"
                caption="North ridge elevation study."
                attribution={{ label: "Field notebook", href: "/field-study.svg" }}
              />
            )}
            {split && (
              <section aria-label="Split preview">
                <h2>Reading view</h2>
                <p>{text}</p>
              </section>
            )}
          </DocumentSurface>
        </>
      )}
    </div>
  );
}
