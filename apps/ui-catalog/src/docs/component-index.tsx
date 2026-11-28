/** The component family directory and workspace example entry point. */
import {
  BookOpen,
  Layers,
  MessagesSquare,
  ArrowUpRight,
  ChevronRight,
  Component,
  Compass,
  PanelLeft,
  LayoutGrid,
  FileText,
  SquareTerminal,
} from "lucide-react";
import { registry } from "./registry";
const families = [
  "Foundation",
  "Navigation",
  "Workspace",
  "Library",
  "Document",
  "Commands",
  "Agent",
];
const glyphs = [
  Component,
  Compass,
  PanelLeft,
  LayoutGrid,
  FileText,
  SquareTerminal,
  MessagesSquare,
];
export function ComponentIndex() {
  const crumbClassName = "catalog-crumb";
  const leadClassName = "catalog-lead";
  const featureClassName = "catalog-feature";
  const miniClassName = "catalog-mini";
  const cardsClassName = "catalog-cards";
  return (
    <>
      <div className={crumbClassName}>
        <BookOpen /> Documentation
      </div>
      <h1>Component library</h1>
      <p className={leadClassName}>
        React components for Chulane’s knowledge workspace. Explore the building blocks, their
        behaviors and the code behind each example.
      </p>
      <div className={featureClassName}>
        <div>
          <h2>Knowledge workspace</h2>
          <p>Explore the adaptive sidebar, document browser and workspace agent together.</p>
          <a href="/examples/knowledge-workspace">
            Open interactive example <ArrowUpRight />
          </a>
        </div>
        <div className={miniClassName} aria-hidden>
          <div>
            <Layers />
            <i />
            <i />
            <i />
          </div>
          <div>
            <strong>Field notes</strong>
            <i />
            <i />
            <i />
            <i />
          </div>
          <div>
            <MessagesSquare />
            <i />
            <i />
          </div>
        </div>
      </div>
      <h2>Browse by component family</h2>
      <div className={cardsClassName}>
        {families.map((family, i) => {
          const Icon = glyphs[i];
          const items = registry.filter((x) => x.family === family);
          return (
            <div key={family}>
              <Icon />
              <h3>{family}</h3>
              {items.map((x) => (
                <a href={"/components/" + x.slug} key={x.slug}>
                  {x.name}
                  <ChevronRight />
                </a>
              ))}
            </div>
          );
        })}
      </div>
    </>
  );
}
