/** Checks the shipped ESM contract, sidebar defaults and public docs coverage. */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import * as ui from "@chulane/ui";

test("the package exposes the root module and compiled stylesheet", () => {
  const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.deepEqual(Object.keys(manifest.exports).sort(), [".", "./styles.css"]);
});

test("the catalog covers public components", () => {
  const docs = readFileSync(
    new URL("../../../apps/ui-catalog/src/docs/registry.ts", import.meta.url),
    "utf8",
  );
  for (const name of Object.keys(ui).filter((n) => /^[A-Z]/.test(n))) {
    assert.ok(docs.includes('"' + name + '"'), name);
  }
});
test("only optional sections start hidden", () => {
  const sections = [
    { id: "recent", label: "Recent", items: [] },
    { id: "graph", label: "Graph", items: [], optional: true },
  ];
  const p = ui.createDefaultSidebarPreferences(sections);
  assert.deepEqual(p, {
    mode: "standard",
    order: ["recent", "graph"],
    hidden: ["graph"],
    collapsed: [],
  });
});
test("barrels contain reexports only", () => {
  const root = new URL("../src/", import.meta.url);
  for (const name of readdirSync(root, { recursive: true }).filter((n) => n.endsWith("index.ts"))) {
    const source = readFileSync(new URL(name, root), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^[ \t]*\/\/.*$/gm, "");
    assert.match(
      source,
      /^(?:\s*export\s+(?:type\s+)?(?:\*|\{[^}]*\})\s+from\s+["'][^"']+["'];?\s*)+$/,
      name,
    );
  }
});

test("public controls render registry slots", () => {
  for (const [component, slot] of [
    [ui.Button, "button"],
    [ui.SearchField, "input"],
    [ui.TextArea, "textarea"],
  ]) {
    assert.match(
      renderToStaticMarkup(createElement(component, { label: "Example" })),
      new RegExp('data-slot="' + slot + '"'),
    );
  }
});

test("the public stylesheet ships compiled controls and embedded fonts", () => {
  const stylesheet = import.meta.resolve("@chulane/ui/styles.css");
  const css = readFileSync(new URL(stylesheet), "utf8");
  assert.match(css, /\.cu-button\b/);
  assert.match(css, /data:font\/woff2;base64,/);
  assert.doesNotMatch(css, /@import\b/);
});

test("composer action spacing honors the surrounding button layout", () => {
  const composer = createElement(ui.AgentComposer, {
    draft: { text: "", context: [], mode: "Ask", model: "Local" },
    availableContext: [],
    modes: ["Ask"],
    models: [{ label: "Local", location: "local" }],
    onDraftChange: assert.fail,
    onSend: assert.fail,
    onStop: assert.fail,
  });
  const plainGroup = createElement(ui.ButtonGroup, { label: "Other actions" });
  const defaultLayouts = renderToStaticMarkup(
    createElement("div", null, composer, plainGroup),
  ).matchAll(/data-layout="(\w+)"/g);
  assert.deepEqual(
    Array.from(defaultLayouts, (match) => match[1]),
    ["separate", "separate", "grouped"],
  );
  const scoped = createElement(
    ui.ThemeScope,
    { buttonLayout: "grouped" },
    createElement(ui.ThemeScope, null, composer),
  );
  assert.deepEqual(renderToStaticMarkup(scoped).match(/data-layout="grouped"/g), [
    'data-layout="grouped"',
    'data-layout="grouped"',
  ]);
});
