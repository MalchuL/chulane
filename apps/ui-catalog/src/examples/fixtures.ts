/** Sample knowledge workspace shared across catalog examples. */
import {
  Star,
  Folders,
  History,
  MessagesSquare,
  Calendar,
  Search,
  Tags,
  Network,
  Library,
} from "lucide-react";
import type { SidebarSection, PageSummary, WorkspaceOption } from "@chulane/ui";
export const workspaceOptions: WorkspaceOption[] = [
  { label: "Personal", location: "local" },
  { label: "Research team", location: "cloud" },
];
export const pages: PageSummary[] = [
  {
    id: "field-notes",
    title: "Field notes",
    description: "Observations from the northern trail.",
    date: "2026-11-24",
    collection: "Pages",
    tags: ["Fieldwork"],
    favorite: true,
  },
  {
    id: "atlas",
    title: "Atlas research",
    description: "A working map of places and ideas.",
    date: "2026-11-23",
    collection: "Projects",
    tags: ["Research"],
    favorite: true,
  },
  {
    id: "journal",
    title: "November journal",
    description: "Mist gathered along the ridgeline.",
    date: "2026-11-22",
    collection: "Journal",
  },
  {
    id: "archive",
    title: "Retired outline",
    description: "The first draft of the field guide.",
    date: "2026-11-20",
    collection: "Trash",
  },
];
export const sections: SidebarSection[] = [
  {
    id: "favorites",
    icon: Star,
    label: "Favorites",
    items: [{ id: "field-notes", label: "Field notes" }],
  },
  {
    id: "projects",
    icon: Folders,
    label: "Projects",
    items: [
      {
        id: "atlas",
        label: "Atlas research",
        children: [{ id: "field-notes", label: "Field notes" }],
      },
    ],
  },
  {
    id: "recent",
    icon: History,
    label: "Recent pages",
    items: pages.slice(0, 3).map((p) => ({ id: p.id, label: p.title })),
  },
  {
    id: "chats",
    icon: MessagesSquare,
    label: "AI conversations",
    items: [{ id: "research-chat", label: "Research review", kind: "conversation" }],
  },
  ...[
    { label: "Daily notes", icon: Calendar },
    { label: "Saved searches", icon: Search },
    { label: "Tags", icon: Tags },
    { label: "Graph", icon: Network },
    { label: "Custom collections", icon: Library },
  ].map(({ label, icon }) => ({
    icon,
    id: label,
    label,
    optional: true,
    items: [],
  })),
];
export const reference = {
  id: "field-notes",
  label: "Field notes",
  href: "/examples/document-editor#field-notes",
};
