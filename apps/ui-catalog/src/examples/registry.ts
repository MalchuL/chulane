/** Composed examples exposed by the catalog router. */
import { Compass, FileText, MessagesSquare } from "lucide-react";
import { KnowledgeWorkspace } from "./knowledge-workspace/knowledge-workspace";
import { DocumentEditor } from "./document-editor/document-editor";
import { AgentReview } from "./agent-review/agent-review";
export const examples = [
  {
    slug: "knowledge-workspace",
    title: "Knowledge workspace",
    description: "Navigate collections, resize panels and find a command.",
    view: KnowledgeWorkspace,
    icon: Compass,
  },
  {
    slug: "document-editor",
    title: "Document editor",
    description: "Edit a passage, open block actions and review page properties.",
    view: DocumentEditor,
    icon: FileText,
  },
  {
    slug: "agent-review",
    title: "Agent review",
    description: "Compose a request, inspect a diff and approve a change.",
    view: AgentReview,
    icon: MessagesSquare,
  },
];
