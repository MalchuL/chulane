/** Checks the shipped ESM contract, sidebar defaults and public docs coverage. */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import * as ui from "chulane_ui";
import { Button } from "chulane_ui/button";
test("entry points and catalog cover public components", () => {
  assert.equal(Button, ui.Button);
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
  const p = ui.defaultSidebar(sections);
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
    const source = readFileSync(new URL(name, root), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    assert.match(
      source,
      /^(?:\s*export\s+(?:type\s+)?(?:\*|\{[^}]*\})\s+from\s+["'][^"']+["'];?\s*)+$/,
    );
  }
});

test("public controls render registry slots and expose one stylesheet", () => {
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
  assert.equal(
    import.meta.resolve("chulane_ui/globals.css"),
    import.meta.resolve("chulane_ui/styles.css"),
  );
});

test("composer action spacing honors the surrounding button layout", () => {
  const composer = createElement(ui.AgentComposer, {
    draft: { text: "", context: [], mode: "Ask", model: "Local" },
    availableContext: [],
    modes: ["Ask"],
    models: ["Local"],
    onChange: assert.fail,
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
