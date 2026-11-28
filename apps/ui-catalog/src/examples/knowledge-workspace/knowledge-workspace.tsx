/** Working composition of navigation, page library and a local agent. */
import { DemoPanels } from "./demo-panels";
import type { DemoWorkspaceLayout } from "./demo-panels";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Search,
  Menu,
  Plus,
  Files,
  NotebookPen,
  Tags,
  Trash2,
  Folders,
  House,
  ArrowLeft,
  ArrowRight,
  Compass,
  Pencil,
  Copy,
  Link,
  Download,
  Star,
  ListTree,
  FilePlus,
  Calendar,
  FolderPlus,
  LayoutTemplate,
  Upload,
  PanelLeft,
  PanelRight,
  Columns2,
  Maximize,
  Sun,
  Moon,
  Monitor,
  Palette,
  Type,
  Scaling,
  Settings2,
  Network,
  Layout,
  Ellipsis,
} from "lucide-react";
import {
  WorkspaceShell,
  ThemeScope,
  SelectField,
  Sidebar,
  WorkspaceSwitcher,
  PageBrowser,
  WorkspaceOverview,
  CommandPalette,
  ConfirmAction,
  ActionMenu,
  IconButton,
  createDefaultSidebarPreferences,
  useTheme,
  Dialog,
  SearchField,
  Button,
  type Command,
  type SidebarPreferences,
  type PageSummary,
  type MenuEntry,
} from "@chulane/ui";
import { useStoredPreference } from "./hooks";
import { pages as samplePages, sections, reference, workspaceOptions } from "../fixtures";
import { DocumentEditor } from "../document-editor/document-editor";
import { AgentReview } from "../agent-review/agent-review";
const initialPages = samplePages.map((page) => {
  if (page.id === "field-notes") {
    return { ...page, thumbnail: { src: "/field-study.svg" } };
  }
  if (page.id === "atlas") {
    return { ...page, thumbnail: { emoji: "🧭" } };
  }
  return page;
});
const destinationIcons = [Files, NotebookPen, Tags, Trash2, Folders, House];
const destinations = ["All pages", "Journal", "Tags", "Trash", "Projects", "Overview"];
const initialLayout: DemoWorkspaceLayout = {
  navigation: true,
  agent: true,
  focus: false,
  split: false,
};
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object";
function sidebarPrefs(v: unknown): v is SidebarPreferences {
  return (
    isRecord(v) &&
    ["compact", "standard", "expanded"].includes(String(v.mode)) &&
    ["order", "collapsed", "hidden"].every(
      (k) => Array.isArray(v[k]) && v[k].every((x: unknown) => typeof x === "string"),
    )
  );
}
function layoutPrefs(v: unknown): v is DemoWorkspaceLayout {
  return (
    isRecord(v) &&
    ["navigation", "agent", "focus", "split"].every((k) => typeof v[k] === "boolean") &&
    ["navWidth", "agentWidth"].every((k) => v[k] === undefined || Number.isFinite(v[k]))
  );
}
export function KnowledgeWorkspace({
  renderMenus,
}: {
  renderMenus?: (
    groups: { id: string; label: string; icon: typeof Plus; items: MenuEntry[] }[],
  ) => ReactNode;
} = {}) {
  const [accent, setAccent] = useState("Purple");
  const [font, setFont] = useState("Geist");
  const [scale, setScale] = useState("Standard");
  const [setting, setSetting] = useState("");
  const panelStackClassName = "cu-panel cu-stack catalog-page-placeholder";

  const [prefs, savePrefs] = useStoredPreference(
    "catalog.sidebar",
    createDefaultSidebarPreferences(sections),
    sidebarPrefs,
  );
  const [layout, saveLayout] = useStoredPreference("catalog.layout", initialLayout, layoutPrefs);
  const [workspace, setWorkspace] = useState("Personal");
  const initialPage = initialPages.find((page) => "#" + page.id === location.hash);
  const [destination, setDestination] = useState(initialPage ? "Page" : "All pages");
  const workspacePages = useRef<Record<string, PageSummary[]>>({});
  const [pages, setPages] = useState(initialPages);
  const [selected, setSelected] = useState(initialPage?.id ?? "");
  const [palette, setPalette] = useState(false);
  const [rename, setRename] = useState<PageSummary | null>(null);
  const [trash, setTrash] = useState<PageSummary | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const [future, setFuture] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const theme = useTheme("chulane.theme");
  function switchWorkspace(next: string) {
    if (next === workspace) {
      return;
    }
    workspacePages.current[workspace] = pages;
    setPages(
      workspacePages.current[next] ?? initialPages.filter((page) => page.collection === "Projects"),
    );
    setWorkspace(next);
    setRecent([]);
    setFuture([]);
    setSelected("");
    setDestination("All pages");
    window.history.replaceState(null, "", location.pathname);
  }
  useEffect(() => {
    function followLink() {
      const target = pages.find((page) => "#" + page.id === location.hash);
      if (target) {
        setSelected(target.id);
        setDestination("Page");
      }
    }
    window.addEventListener("hashchange", followLink);
    return () => window.removeEventListener("hashchange", followLink);
  }, [pages]);
  function open(id: string) {
    setRecent((r) => [...r, selected || destination]);
    setFuture([]);
    if (destinations.includes(id)) {
      setDestination(id);
      setSelected("");
    } else if (id === "research-chat") {
      saveLayout({ ...layout, agent: true, focus: false });
      setDestination("Conversations");
      setSelected("");
    } else {
      setSelected(id);
      setDestination("Page");
    }
  }
  function go(id: string) {
    setSelected(destinations.includes(id) ? "" : id);
    setDestination(destinations.includes(id) ? id : "Page");
  }
  function create(collection: string, title?: string, description = "") {
    const page = {
      id: crypto.randomUUID(),
      title: title ?? "Untitled " + (collection === "Pages" ? "page" : collection),
      description,
      date: new Date().toISOString().slice(0, 10),
      collection,
    };
    setPages((current) => [...current, page]);
    open(page.id);
    setRename(page);
  }
  function downloadPage(page: PageSummary, markdown: boolean) {
    const link = document.createElement("a");
    const text = (markdown ? "# " : "") + page.title + "\n\n" + (page.description ?? "");
    const url = URL.createObjectURL(
      new Blob([text], { type: markdown ? "text/markdown" : "text/plain" }),
    );
    link.href = url;
    link.download = page.title + (markdown ? ".md" : ".txt");
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  function actions(page: PageSummary): Command[] {
    return [
      {
        id: "properties",
        label: "Properties",
        icon: ListTree,
        onSelect: () => {
          open(page.id);
          setSetting("Properties");
        },
      },
      {
        id: "rename",
        icon: Pencil,
        shortcut: "F2",
        label: "Rename",
        onSelect: () => setRename(page),
      },
      {
        id: "duplicate",
        icon: Copy,
        label: "Duplicate",
        onSelect: () =>
          setPages([...pages, { ...page, id: crypto.randomUUID(), title: page.title + " copy" }]),
      },
      {
        id: "favorite",
        icon: Star,
        label: "Favorite",
        checked: !!page.favorite,
        onSelect: () =>
          setPages(pages.map((p) => (p.id === page.id ? { ...p, favorite: !p.favorite } : p))),
      },
      {
        id: "link",
        icon: Link,
        label: "Copy link",
        onSelect: () =>
          void navigator.clipboard.writeText(
            location.origin + "/examples/knowledge-workspace#" + page.id,
          ),
      },
      {
        id: "export",
        icon: Download,
        label: "Export",
        onSelect: () => downloadPage(page, false),
      },
      {
        id: "trash",
        icon: Trash2,
        destructive: true,
        label: "Move to trash",
        onSelect: () => setTrash(page),
      },
    ];
  }
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((v) => !v);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  const createCommands: Command[] = ["Pages", "Journal", "Projects"].map((c) => ({
    id: "create-" + c,
    label: "Create " + { Pages: "page", Journal: "journal entry", Projects: "project" }[c],
    group: "Create",
    onSelect: () => create(c),
  }));
  createCommands.push(
    {
      id: "template",
      label: "From meeting notes template",
      group: "Create",
      onSelect: () => create("Pages", "Meeting notes", "Agenda\n\nDecisions\n\nNext steps"),
    },
    {
      id: "import",
      label: "Import text or Markdown",
      group: "Create",
      onSelect: () => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".txt,.md,text/plain,text/markdown";
        input.onchange = async () => {
          const file = input.files?.[0];
          if (file) {
            try {
              create("Pages", file.name, await file.text());
            } catch {
              setNotice("Could not read the selected file.");
            }
          }
        };
        input.click();
      },
    },
  );
  const viewCommands: Command[] = (["navigation", "agent", "split", "focus"] as const).map(
    (key) => ({
      id: key,
      label: {
        navigation: "Navigation",
        agent: "Workspace agent",
        split: "Split view",
        focus: "Focus mode",
      }[key],
      group: "View",
      checked: layout[key],
      onSelect: () => saveLayout({ ...layout, [key]: !layout[key] }),
    }),
  );
  const appearance: Command[] = (["light", "dark", "system"] as const).map((t) => ({
    id: t,
    label: t[0].toUpperCase() + t.slice(1),
    group: "Appearance",
    checked: theme.preference === t,
    onSelect: () => theme.setPreference(t),
  }));
  const navSections = sections.map((section) => {
    let items;
    if (section.id === "favorites") {
      items = pages.filter((p) => p.favorite);
    } else if (section.id === "recent") {
      items = pages.filter((p) => p.collection !== "Trash").slice(-3);
    } else if (section.id === "projects" && workspace !== "Personal") {
      items = pages.filter((p) => p.collection === "Projects");
    } else {
      return section;
    }
    return { ...section, items: items.map((p) => ({ id: p.id, label: p.title })) };
  });
  const page = pages.find((p) => p.id === selected);
  const menuPage = page ?? pages[0];
  const createItems = createCommands.map((c, i) => ({
    ...c,
    icon: [FilePlus, Calendar, FolderPlus, LayoutTemplate, Upload][i],
  }));
  const viewItems = [
    ...viewCommands.map((c, i) => ({
      ...c,
      icon: [PanelLeft, PanelRight, Columns2, Maximize][i],
    })),
    {
      id: "graph",
      label: "Graph view",
      icon: Network,
      onSelect: () => setSetting("Graph view"),
    },
    {
      id: "Editor layout",
      label: "Editor layout",
      icon: Settings2,
      onSelect: () => setSetting("Editor layout"),
    },
  ];
  const preferences = [
    {
      label: "Accent color",
      icon: Palette,
      options: ["Purple", "Neutral"],
      value: accent,
      change: setAccent,
    },
    {
      label: "Typography",
      icon: Type,
      options: ["Geist", "Monospace"],
      value: font,
      change: setFont,
    },
    {
      label: "Interface scale",
      icon: Scaling,
      options: ["Standard", "Large"],
      value: scale,
      change: setScale,
    },
    {
      label: "Editor layout",
      icon: Settings2,
      options: ["Single", "Split"],
      value: layout.split ? "Split" : "Single",
      change: (value: string) => saveLayout({ ...layout, split: value === "Split" }),
    },
  ];
  const appearanceItems = [
    ...appearance.map((c, i) => ({ ...c, icon: [Sun, Moon, Monitor][i] })),
    ...preferences.slice(0, 3).map(({ label, icon }) => ({
      id: label,
      label,
      icon,
      onSelect: () => setSetting(label),
    })),
  ];
  const groups = [
    { id: "create", label: "Create", icon: Plus, items: createItems },
    {
      id: "page",
      label: "Page actions",
      icon: Ellipsis,
      items: menuPage ? actions(menuPage) : [],
    },
    { id: "view", label: "View", icon: Layout, items: viewItems },
    { id: "theme", label: "Appearance", icon: Palette, items: appearanceItems },
  ];
  const commands = [
    ...groups.flatMap((group) =>
      group.items.map((item) => ({ ...item, id: group.id + "/" + item.id, group: group.label })),
    ),
    ...destinations.map((label) => ({
      id: label,
      label,
      group: "Go to",
      onSelect: () => open(label),
    })),
    ...pages.map((p) => ({
      id: "destination/page/" + p.id,
      label: p.title,
      group: "Pages",
      onSelect: () => open(p.id),
    })),
  ];
  useEffect(() => {
    function renamePage(event: KeyboardEvent) {
      if (event.key === "F2" && menuPage && !document.querySelector('[role="dialog"]')) {
        event.preventDefault();
        setRename(menuPage);
      }
    }
    window.addEventListener("keydown", renamePage);
    return () => window.removeEventListener("keydown", renamePage);
  }, [menuPage]);
  let mainContent;
  if (destination === "Overview") {
    mainContent = (
      <WorkspaceOverview
        title="Workspace overview"
        sections={[
          { label: "Recent documents", items: [reference] },
          {
            label: "Pinned projects",
            items: [{ id: "atlas", label: "Atlas research", href: "#atlas" }],
          },
        ]}
      />
    );
  } else {
    if (destination === "Conversations") {
      mainContent = <AgentReview />;
    } else {
      if (page) {
        mainContent = (
          <div className={panelStackClassName}>
            <h2>{page.title}</h2>
            <p>{page.description}</p>
            <ActionMenu
              label="Page options"
              trigger={<Button variant="outline">Page options</Button>}
              items={actions(page)}
            />
            <a href="/examples/document-editor">Open editor example</a>
          </div>
        );
      } else {
        mainContent = (
          <PageBrowser
            title={destination}
            pages={pages.filter((p) => {
              if (destination === "All pages") {
                return p.collection !== "Trash";
              }
              if (destination === "Tags") {
                return !!p.tags?.length;
              }
              return p.collection === destination;
            })}
            selected={selected}
            onOpen={open}
            onCreate={() => create(destination === "All pages" ? "Pages" : destination)}
            getActions={actions}
          />
        );
      }
    }
  }
  return (
    <ThemeScope
      tokens={{
        ...(accent === "Neutral" && {
          "--ui-accent": "var(--ui-text)",
          "--ui-on-accent": "var(--ui-editor)",
        }),
        ...(font === "Monospace" && { "--ui-font": "var(--ui-mono)" }),
        ...(scale === "Large" && {
          "--ui-control": "var(--ui-control-lg)",
          "--ui-body": "var(--ui-reading)",
          "--ui-menu-label": "var(--ui-reading)",
        }),
      }}
    >
      {renderMenus?.(
        groups.map((group) => ({
          ...group,
          items: group.items.map((item) => {
            if (item.id === "template" || item.id === "import") {
              return {
                id: item.id,
                label: item.id === "template" ? "From template" : "Import",
                icon: item.icon,
                items: [item],
              };
            }
            if (item.id === "export" && menuPage) {
              return {
                id: item.id,
                label: "Export",
                icon: item.icon,
                items: [
                  { ...item, label: "Plain text" },
                  {
                    id: "markdown",
                    label: "Markdown",
                    onSelect: () => downloadPage(menuPage, true),
                  },
                ],
              };
            }
            const choices = preferences.find((choice) => choice.label === item.id);
            if (choices) {
              return {
                id: item.id,
                label: item.label,
                icon: item.icon,
                items: choices.options.map((value) => ({
                  id: value,
                  label: value,
                  checked: value === choices.value,
                  onSelect: () => choices.change(value),
                })),
              };
            }
            return item;
          }),
        })),
      )}
      <WorkspaceShell
        renderPanels={(panels) => (
          <DemoPanels panels={panels} layout={layout} onLayoutChange={saveLayout} />
        )}
        sidebarMode={prefs.mode}
        sidebarOpen={layout.navigation}
        onSidebarOpenChange={(navigation) => saveLayout({ ...layout, navigation })}
        agentOpen={layout.agent}
        onAgentOpenChange={(agent) => saveLayout({ ...layout, agent })}
        focusMode={layout.focus}
        onFocusModeChange={(focus) => saveLayout({ ...layout, focus })}
        splitView={layout.split}
        onSplitViewChange={(split) => saveLayout({ ...layout, split })}
        sidebarWidth={layout.navWidth}
        agentWidth={layout.agentWidth}
        toolbar={
          <>
            <ActionMenu
              label="Workspace menus"
              trigger={
                <IconButton label="Workspace menus">
                  <Menu />
                </IconButton>
              }
              items={[
                ...groups,
                {
                  id: "go",
                  icon: Compass,
                  label: "Go to",
                  items: destinations.map((label, i) => ({
                    icon: destinationIcons[i],
                    id: label,
                    label,
                    onSelect: () => open(label),
                  })),
                },
                {
                  id: "back",
                  icon: ArrowLeft,
                  label: "Back",
                  disabled: !recent.length,
                  onSelect: () => {
                    go(recent.at(-1)!);
                    setRecent(recent.slice(0, -1));
                    setFuture([...future, selected || destination]);
                  },
                },
                {
                  id: "forward",
                  icon: ArrowRight,
                  label: "Forward",
                  disabled: !future.length,
                  onSelect: () => {
                    go(future.at(-1)!);
                    setFuture(future.slice(0, -1));
                    setRecent([...recent, selected || destination]);
                  },
                },
              ]}
            />
            <IconButton label="Create page" onClick={() => create("Pages")}>
              <Plus />
            </IconButton>
            <CommandPalette
              open={palette}
              onOpenChange={setPalette}
              commands={commands}
              trigger={
                <IconButton label="Search commands" aria-keyshortcuts="Control+K Meta+K">
                  <Search />
                </IconButton>
              }
            />
          </>
        }
        sidebar={(compact) => (
          <Sidebar
            compact={compact}
            header={
              <WorkspaceSwitcher
                value={workspace}
                options={workspaceOptions}
                onValueChange={switchWorkspace}
              />
            }
            compactHeader={
              <WorkspaceSwitcher
                compact
                value={workspace}
                options={workspaceOptions}
                onValueChange={switchWorkspace}
              />
            }
            destinations={destinations.map((label, i) => ({
              id: label,
              label,
              icon: destinationIcons[i],
            }))}
            footer={
              <small>
                {workspaceOptions.find((option) => option.label === workspace)?.location === "cloud"
                  ? "Cloud workspace"
                  : "Local workspace"}
              </small>
            }
            selected={selected || destination}
            sections={navSections}
            preferences={prefs}
            onPreferencesChange={savePrefs}
            onSelectedChange={open}
            actions={(item) => {
              const p = pages.find((p) => p.id === item.id);
              return p ? actions(p) : [];
            }}
          />
        )}
        agent={(close) => (
          <div data-workspace-agent-pane>
            <AgentReview onClose={close} />
          </div>
        )}
        secondaryMain={<DocumentEditor />}
        main={mainContent}
      />
      <Dialog
        open={!!rename}
        title="Page title"
        onOpenChange={(open) => {
          if (!open) {
            setRename(null);
          }
        }}
      >
        {rename && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (rename.title.trim()) {
                setPages(pages.map((p) => (p.id === rename.id ? rename : p)));
                setRename(null);
              }
            }}
          >
            <SearchField
              label="Page title"
              value={rename.title}
              onValueChange={(title) => setRename({ ...rename, title })}
            />
            <Button type="submit">Save title</Button>
          </form>
        )}
      </Dialog>
      <ConfirmAction
        title="Move to trash?"
        description={trash?.title ?? ""}
        open={!!trash}
        onOpenChange={(next) => {
          if (!next) {
            setTrash(null);
          }
        }}
        confirmLabel="Move to trash"
        onConfirm={() => {
          if (!trash) {
            return;
          }
          setPages(pages.map((p) => (p.id === trash.id ? { ...p, collection: "Trash" } : p)));
          setNotice("Moved to Trash");
          setTrash(null);
          open("All pages");
        }}
      />
      <Dialog
        title={setting}
        open={!!setting}
        onOpenChange={(open) => {
          if (!open) {
            setSetting("");
          }
        }}
      >
        {setting === "Properties" && page && (
          <dl>
            <dt>Title</dt>
            <dd>{page.title}</dd>
            <dt>Collection</dt>
            <dd>{page.collection}</dd>
            <dt>Last edited</dt>
            <dd>{page.date}</dd>
          </dl>
        )}
        {setting === "Graph view" && (
          <ul>
            {pages
              .filter((p) => p.collection !== "Trash")
              .map((p) => (
                <li key={p.id}>
                  {p.collection} →{" "}
                  <Button
                    variant="link"
                    onClick={() => {
                      open(p.id);
                      setSetting("");
                    }}
                  >
                    {p.title}
                  </Button>
                </li>
              ))}
          </ul>
        )}
        {preferences
          .filter((choice) => choice.label === setting)
          .map((choice) => (
            <SelectField
              key={choice.label}
              label={choice.label}
              options={choice.options}
              value={choice.value}
              onValueChange={choice.change}
            />
          ))}
      </Dialog>
      <span role="status">{notice}</span>
    </ThemeScope>
  );
}
