/** Displays the running example, its original source and the public TypeScript contract. */
import { ScrollArea } from "chulane_ui";
import { useState } from "react";
import type { ComponentType } from "react";
import { Check, Copy } from "lucide-react";
import { IconButton, SegmentedControl } from "chulane_ui";
import api from "virtual:component-api";
import type { registry } from "./registry";
import { notes } from "./interaction-notes";

const modules = import.meta.glob<{ default: ComponentType }>("./*/example.tsx", {
  eager: true,
});
const sources = import.meta.glob<string>("./*/example.tsx", {
  eager: true,
  query: "?raw",
  import: "default",
});
export function ComponentPage({ item }: { item: (typeof registry)[number] }) {
  const crumbClassName = "catalog-crumb";
  const leadClassName = "catalog-lead";
  const docControlsClassName = "catalog-doc-controls";
  const previewClassName = "catalog-preview";
  const codeClassName = "catalog-code";
  const tableClassName = "catalog-table";
  const tokenClassName = "catalog-token";
  const [tab, setTab] = useState("Preview");
  const [copied, setCopied] = useState(false);
  const path = "./" + item.slug + "/example.tsx";
  const Example = modules[path].default;
  const source = sources[path];
  let exampleSlug = "knowledge-workspace";
  if (item.family === "Agent") {
    exampleSlug = "agent-review";
  } else if (item.family === "Document") {
    exampleSlug = "document-editor";
  }
  const [tokens, keys] = notes[item.name];
  return (
    <article>
      <div className={crumbClassName}>
        <a href="/components">Components</a> / {item.family}
      </div>
      <h1>{item.name}</h1>
      <p className={leadClassName}>{item.description}</p>
      <div className={docControlsClassName}>
        <SegmentedControl
          label="Example view"
          value={tab}
          options={["Preview", "Code"]}
          onChange={setTab}
        />
        <IconButton
          label="Copy example"
          onClick={async () => {
            await navigator.clipboard.writeText(source);
            setCopied(true);
          }}
        >
          {copied ? <Check /> : <Copy />}
        </IconButton>
      </div>
      {tab === "Preview" ? (
        <ScrollArea orientation="horizontal" className={previewClassName}>
          <Example />
        </ScrollArea>
      ) : (
        <ScrollArea orientation="horizontal">
          <pre className={codeClassName}>
            <code>{source}</code>
          </pre>
        </ScrollArea>
      )}
      <h2>Usage</h2>
      <p>
        {item.description} See it in the <a href={"/examples/" + exampleSlug}>composed example</a>.
      </p>
      <h2>Props</h2>
      {api[item.name]?.length ? (
        <ScrollArea orientation="horizontal" className={tableClassName}>
          <table>
            <thead>
              <tr>
                <th>Prop</th>
                <th>Type</th>
              </tr>
            </thead>
            <tbody>
              {api[item.name].map((p) => (
                <tr key={p.name}>
                  <td>
                    <code>
                      {p.name}
                      {p.optional ? "?" : ""}
                    </code>
                  </td>
                  <td>
                    <code>{p.type}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollArea>
      ) : (
        <p>This component takes no props.</p>
      )}
      <h2>Theme tokens</h2>
      <p>
        {tokens
          .split(",")
          .map((t) => "--ui-" + t)
          .map((t) => (
            <code className={tokenClassName} key={t}>
              {t}
            </code>
          ))}
      </p>
      <h2>Keyboard</h2>
      <p>{keys}</p>
    </article>
  );
}
